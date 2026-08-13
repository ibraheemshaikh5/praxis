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
import type {
  ConnectionDetailPayload,
  ConnectionResponse,
  CreateConnectionBody,
  CreateConnectionMeetingBody,
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
    // The write bumps the version, and the next edit has to send the new one:
    // two saves in quick succession would otherwise be a conflict.
    onSuccess: (result) => {
      client.setQueryData<ConnectionResponse>(
        rolodexKeys.connection(result.connection.id),
        result,
      );
    },
    onError: (error) => reportError(error, "Could not save that."),
    onSettled: () => invalidateRolodex(client),
  });
}

export function useDeleteConnection() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (connectionId: string) => deleteConnection(connectionId),
    onSuccess: (result) => {
      // The detail page is still mounted while it navigates away; dropping the
      // card keeps it from refetching a row that is gone.
      client.removeQueries({
        queryKey: rolodexKeys.connection(result.connection.id),
      });
      toast.success(`Removed ${result.connection.name}.`);
    },
    onError: (error) => reportError(error, "Could not remove that card."),
    onSettled: () => client.invalidateQueries({ queryKey: rolodexKeys.list }),
  });
}

export function useAddMeeting(connectionId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateConnectionMeetingBody) =>
      createConnectionMeeting(connectionId, body),
    onError: (error) => reportError(error, "Could not log that meeting."),
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
    onError: (error) => reportError(error, "Could not save that meeting."),
    onSettled: () => invalidateRolodex(client),
  });
}

export function useDeleteMeeting(connectionId: string) {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (meetingId: string) =>
      deleteConnectionMeeting(connectionId, meetingId),
    onError: (error) => reportError(error, "Could not remove that meeting."),
    onSettled: () => invalidateRolodex(client),
  });
}
