"use client";

import * as React from "react";

import { AddReadingBar } from "@/components/reading/add-reading-bar";
import { BookPicker, type BookChoice } from "@/components/reading/book-picker";
import { ArticleCard, BookCard } from "@/components/reading/reading-card";
import { AppShell } from "@/components/shell/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCreateReadingItem,
  useReadingItems,
  useUpdateReadingItem,
} from "@/hooks/use-reading";
import { signOut } from "@/lib/auth/actions";
import type { ReadingItemPayload } from "@/lib/api/types";
import { parseEntry } from "@/lib/reading/entry";

export function ReadingApp({ userEmail }: { userEmail: string | null }) {
  const { data, isError, isLoading } = useReadingItems();
  const createItem = useCreateReadingItem();
  const updateItem = useUpdateReadingItem();

  const [entry, setEntry] = React.useState("");
  // The title the picker is open for, held apart from the bar so editing the
  // text behind the dialog cannot change what is being chosen.
  const [pickingTitle, setPickingTitle] = React.useState<string | null>(null);

  const items = React.useMemo(() => data?.items ?? [], [data?.items]);
  const books = items.filter((item) => item.kind === "book");
  const articles = items.filter((item) => item.kind === "article");

  // A link says what it is; only a title has more than one book behind it.
  function submitEntry(input: string) {
    if (parseEntry(input).kind === "article") {
      createItem.mutate({ input }, { onSuccess: () => setEntry("") });
      return;
    }

    setPickingTitle(input);
  }

  function chooseBook(choice: BookChoice) {
    if (pickingTitle === null) return;

    createItem.mutate(
      { input: pickingTitle, ...choice },
      {
        onSuccess: () => {
          setPickingTitle(null);
          setEntry("");
        },
      },
    );
  }

  function selectCover(item: ReadingItemPayload, cover: string) {
    if (cover === item.imageUrl) return;
    updateItem.mutate({
      itemId: item.id,
      body: { imageUrl: cover, expectedVersion: item.version },
    });
  }

  return (
    <AppShell onSignOut={signOut} title="Reading" userEmail={userEmail}>
      <div className="py-8 lg:py-10">
        <header className="mb-10 flex flex-col gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">Reading</h1>
          <AddReadingBar
            onChange={setEntry}
            onSubmit={submitEntry}
            pending={createItem.isPending}
            value={entry}
          />
        </header>

        {isLoading ? (
          <div
            aria-label="Loading reading list"
            className="grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5"
            role="status"
          >
            {[0, 1, 2, 3, 4].map((index) => (
              <Skeleton className="aspect-[2/3] rounded-xl" key={index} />
            ))}
            <span className="sr-only">Loading reading list</span>
          </div>
        ) : null}

        {!isLoading && isError ? (
          <p className="text-sm text-muted-foreground">
            Could not load your reading list. Try again shortly.
          </p>
        ) : null}

        {!isLoading && !isError && items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing saved yet.</p>
        ) : null}

        {books.length > 0 ? (
          <section className="mb-12">
            <h2 className="mb-4 text-sm font-medium tracking-wide text-muted-foreground uppercase">
              Books
            </h2>
            <div className="grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
              {books.map((item) => (
                <BookCard
                  item={item}
                  key={item.id}
                  onSelectCover={(cover) => selectCover(item, cover)}
                />
              ))}
            </div>
          </section>
        ) : null}

        {articles.length > 0 ? (
          <section className="pb-4">
            <h2 className="mb-4 text-sm font-medium tracking-wide text-muted-foreground uppercase">
              Articles
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {articles.map((item) => (
                <ArticleCard item={item} key={item.id} />
              ))}
            </div>
          </section>
        ) : null}
      </div>

      <BookPicker
        onCancel={() => setPickingTitle(null)}
        onChoose={chooseBook}
        pending={createItem.isPending}
        query={pickingTitle}
      />
    </AppShell>
  );
}
