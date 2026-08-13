"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";

import {
  ApiError,
  createConnection,
  createConnectionMeeting,
  deleteConnection,
  deleteConnectionMeeting,
  fetchConnection,
  fetchConnections,
  updateConnection,
  updateConnectionMeeting,
} from "@/lib/api/client";
import { applyOptimistically } from "@/lib/api/optimistic";
import type {
  ConnectionDetailPayload,
  ConnectionMeetingPayload,
  ConnectionResponse,
  CreateConnectionBody,
  CreateConnectionMeetingBody,
  RolodexResponse,
  UpdateConnectionBody,
  UpdateConnectionMeetingBody,
} from "@/lib/api/types";

export const rolodexKeys = {
  all: ["rolodex"] as const,
  list: ["rolodex", "list"] as const,
  connection: (connectionId: string) =>
    ["rolodex", "connection", connectionId] as const,
};

function reportError(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    toast.error(error.message);
    return;
  }

  toast.error(fallback);
}

function invalidateRolodex(client: QueryClient) {
  return client.invalidateQueries({ queryKey: rolodexKeys.all });
}

/** The log reads newest first, same as the server orders it. */
function sortMeetings(meetings: ConnectionMeetingPayload[]) {
  return [...meetings].sort((a, b) => b.metOn.localeCompare(a.metOn));
}

function editMeetings(
  client: QueryClient,
  connectionId: string,
  edit: (meetings: ConnectionMeetingPayload[]) => ConnectionMeetingPayload[],
) {
  client.setQueryData<ConnectionResponse>(
    rolodexKeys.connection(connectionId),
    (current) =>
      current
        ? {
            connection: {
              ...current.connection,
              meetings: sortMeetings(edit(current.connection.meetings)),
            },
          }
        : current,
  );
}

export function useConnections() {
  return useQuery({
    queryKey: rolodexKeys.list,
    queryFn: () => fetchConnections(),
    staleTime: 15_000,
  });
}

export function useConnection(
  connectionId: string,
  initialConnection: ConnectionDetailPayload,
) {
  return useQuery({
    queryKey: rolodexKeys.connection(connectionId),
    queryFn: () => fetchConnection(connectionId),
    initialData: { connection: initialConnection } satisfies ConnectionResponse,
    staleTime: 15_000,
  });
}

export function useCreateConnection() {
  const client = useQueryClient();

  return useMutation({
    // The server parses the pasted input into a profile, so there is no row
    // to render until it answers; the composer shows the pending state.
    mutationFn: (body: CreateConnectionBody) => createConnection(body),
    onSuccess: (result) => {
      if (result.duplicate) {
        toast.info(`Already in the rolodex: ${result.connection.name}`);
        return;
      }
      toast.success(`Added ${result.connection.name}.`);
    },
    onError: (error) => reportError(error, "Could not add that person."),
    onSettled: () => invalidateRolodex(client),
  });
}

export function useUpdateConnection() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: { connectionId: string; body: UpdateConnectionBody }) =>
      updateConnection(input.connectionId, input.body),
    async onMutate(input) {
      const detailKey = rolodexKeys.connection(input.connectionId);
      const fields = stripVersion(input.body);
      const rollback = await applyOptimistically(
        client,
        [detailKey, rolodexKeys.list],
        () => {
          client.setQueryData<ConnectionResponse>(detailKey, (current) =>
            current
              ? {
                  connection: {
                    ...current.connection,
                    ...fields,
                    version: current.connection.version + 1,
                  },
                }
              : current,
          );
          client.setQueryData<RolodexResponse>(rolodexKeys.list, (current) =>
            current
              ? {
                  connections: current.connections.map((connection) =>
                    connection.id === input.connectionId
                      ? { ...connection, ...fields }
                      : connection,
                  ),
                }
              : current,
          );
        },
      );
      return { rollback };
    },
    // The write bumps the version, and the next edit has to send the new one:
    // two saves in quick succession would otherwise be a conflict.
    onSuccess: (result) => {
      client.setQueryData<ConnectionResponse>(
        rolodexKeys.connection(result.connection.id),
        result,
      );
    },
    onError: (error, _input, context) => {
      context?.rollback();
      reportError(error, "Could not save that.");
    },
    onSettled: () => invalidateRolodex(client),
  });
}

export function useDeleteConnection() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (connectionId: string) => deleteConnection(connectionId),
    async onMutate(connectionId) {
      const rollback = await applyOptimistically(
        client,
        [rolodexKeys.list],
        () => {
          client.setQueryData<RolodexResponse>(rolodexKeys.list, (current) =>
            current
              ? {
                  connections: current.connections.filter(
                    (connection) => connection.id !== connectionId,
                  ),
                }
              : current,
          );
        },
      );
      return { rollback };
    },
    onSuccess: (result) => {
      // The detail page is still mounted while it navigates away; dropping the
      // card keeps it from refetching a row that is gone.
      client.removeQueries({
        queryKey: rolodexKeys.connection(result.connection.id),
      });
      toast.success(`Removed ${result.connection.name}.`);
    },
    onError: (error, _input, context) => {
      context?.rollback();
      reportError(error, "Could not remove that card.");
    },
    onSettled: () => client.invalidateQueries({ queryKey: rolodexKeys.list }),
  });
}

export function useAddMeeting(connectionId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateConnectionMeetingBody) =>
      createConnectionMeeting(connectionId, body),
    async onMutate(body) {
      const rollback = await applyOptimistically(
        client,
        [rolodexKeys.connection(connectionId)],
        () => {
          const now = new Date().toISOString();
          editMeetings(client, connectionId, (meetings) => [
            ...meetings,
            {
              // A provisional row; the refetch replaces it with the stored one.
              id: crypto.randomUUID(),
              connectionId,
              userId: "",
              metOn: body.metOn,
              notes: body.notes ?? null,
              createdAt: now,
              updatedAt: now,
            },
          ]);
        },
      );
      return { rollback };
    },
    onError: (error, _input, context) => {
      context?.rollback();
      reportError(error, "Could not log that meeting.");
    },
    onSettled: () => invalidateRolodex(client),
  });
}

export function useUpdateMeeting(connectionId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      meetingId: string;
      body: UpdateConnectionMeetingBody;
    }) => updateConnectionMeeting(connectionId, input.meetingId, input.body),
    async onMutate(input) {
      const rollback = await applyOptimistically(
        client,
        [rolodexKeys.connection(connectionId)],
        () => {
          editMeetings(client, connectionId, (meetings) =>
            meetings.map((meeting) =>
              meeting.id === input.meetingId
                ? {
                    ...meeting,
                    ...input.body,
                    updatedAt: new Date().toISOString(),
                  }
                : meeting,
            ),
          );
        },
      );
      return { rollback };
    },
    onError: (error, _input, context) => {
      context?.rollback();
      reportError(error, "Could not save that meeting.");
    },
    onSettled: () => invalidateRolodex(client),
  });
}

export function useDeleteMeeting(connectionId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (meetingId: string) =>
      deleteConnectionMeeting(connectionId, meetingId),
    async onMutate(meetingId) {
      const rollback = await applyOptimistically(
        client,
        [rolodexKeys.connection(connectionId)],
        () => {
          editMeetings(client, connectionId, (meetings) =>
            meetings.filter((meeting) => meeting.id !== meetingId),
          );
        },
      );
      return { rollback };
    },
    onError: (error, _input, context) => {
      context?.rollback();
      reportError(error, "Could not remove that meeting.");
    },
    onSettled: () => invalidateRolodex(client),
  });
}

/** `expectedVersion` is a write-time guard, not a field the card displays. */
function stripVersion(body: UpdateConnectionBody) {
  const fields: Partial<UpdateConnectionBody> = { ...body };
  delete fields.expectedVersion;
  return fields;
}
