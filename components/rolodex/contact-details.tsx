"use client";

import * as React from "react";
// Lucide carries no brand marks, so LinkedIn and X are a link and an at-sign;
// the value beside them already reads as what it is.
import { AtSign, Link, Loader2, Mail, Phone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  ConnectionDetailPayload,
  UpdateConnectionBody,
} from "@/lib/api/types";

type ContactFields = {
  linkedinUrl: string;
  email: string;
  phone: string;
  xUrl: string;
};

const FIELDS: {
  key: keyof ContactFields;
  label: string;
  icon: React.ComponentType<{ "aria-hidden"?: boolean; className?: string }>;
  inputType: string;
}[] = [
  { key: "linkedinUrl", label: "LinkedIn", icon: Link, inputType: "url" },
  { key: "email", label: "Email", icon: Mail, inputType: "email" },
  { key: "phone", label: "Phone", icon: Phone, inputType: "tel" },
  { key: "xUrl", label: "X", icon: AtSign, inputType: "text" },
];

export function ContactDetails({
  connection,
  onSave,
  pending,
}: {
  connection: ConnectionDetailPayload;
  onSave: (fields: Partial<UpdateConnectionBody>, done: () => void) => void;
  pending: boolean;
}) {
  const [editing, setEditing] = React.useState(false);
  const saved = savedFields(connection);
  const anySaved = FIELDS.some(({ key }) => saved[key] !== "");

  if (editing) {
    return (
      <ContactForm
        initial={saved}
        onCancel={() => setEditing(false)}
        onSave={(fields) => onSave(fields, () => setEditing(false))}
        pending={pending}
      />
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {anySaved ? (
        <dl className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          {FIELDS.map(({ key, label, icon: Icon }) => {
            const value = saved[key];
            if (!value) return null;

            return (
              <div className="flex items-center gap-1.5" key={key}>
                <dt className="sr-only">{label}</dt>
                <Icon
                  aria-hidden
                  className="size-4 shrink-0 text-muted-foreground"
                />
                <dd className="min-w-0">
                  <a
                    className="rounded-4xl underline decoration-muted-foreground/40 underline-offset-4 transition-colors hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                    href={hrefFor(key, value)}
                    rel="noreferrer noopener"
                    target={
                      key === "email" || key === "phone" ? undefined : "_blank"
                    }
                  >
                    {displayValue(key, value)}
                  </a>
                </dd>
              </div>
            );
          })}
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">No contact details.</p>
      )}

      <Button onClick={() => setEditing(true)} size="sm" variant="ghost">
        Edit
      </Button>
    </div>
  );
}

function ContactForm({
  initial,
  onCancel,
  onSave,
  pending,
}: {
  initial: ContactFields;
  onCancel: () => void;
  onSave: (fields: Partial<UpdateConnectionBody>) => void;
  pending: boolean;
}) {
  const [draft, setDraft] = React.useState(initial);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;

    // Only what changed is sent, so an untouched field cannot fail validation
    // it was never subject to.
    const fields: Partial<UpdateConnectionBody> = {};
    for (const { key } of FIELDS) {
      const value = draft[key].trim();
      if (value === initial[key]) continue;
      fields[key] = value || null;
    }

    if (Object.keys(fields).length === 0) {
      onCancel();
      return;
    }

    onSave(fields);
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={submit}>
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map(({ key, label, inputType }) => (
          <label className="flex flex-col gap-1 text-sm" key={key}>
            <span className="text-muted-foreground">{label}</span>
            <Input
              autoComplete="off"
              className="h-9"
              inputMode={key === "phone" ? "tel" : undefined}
              name={key}
              onChange={(event) =>
                setDraft({ ...draft, [key]: event.target.value })
              }
              spellCheck={false}
              type={inputType}
              value={draft[key]}
            />
          </label>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Button disabled={pending} size="sm" type="submit">
          {pending ? (
            <Loader2 className="animate-spin motion-reduce:animate-none" />
          ) : null}
          Save
        </Button>
        <Button onClick={onCancel} size="sm" type="button" variant="ghost">
          Cancel
        </Button>
      </div>
    </form>
  );
}

function savedFields(connection: ConnectionDetailPayload): ContactFields {
  return {
    linkedinUrl: connection.linkedinUrl ?? "",
    email: connection.email ?? "",
    phone: connection.phone ?? "",
    xUrl: connection.xUrl ?? "",
  };
}

function hrefFor(key: keyof ContactFields, value: string) {
  if (key === "email") return `mailto:${value}`;
  // Dial characters only: a number written "+1 (555) 010-1234" still dials.
  if (key === "phone") return `tel:${value.replace(/[^\d+*#;,]/g, "")}`;
  return value;
}

/** The link is stored whole; what is worth reading is the part that varies. */
function displayValue(key: keyof ContactFields, value: string) {
  if (key === "linkedinUrl") return value.replace(/^https:\/\/www\./, "");
  if (key === "xUrl") return `@${value.replace(/^https:\/\/x\.com\//, "")}`;
  return value;
}
