/** Keeps accepted upload identities independent of the page that started them. */
export class UploadNavigation {
  pending = false;
  acceptedId: string | null = null;

  async submit<T extends { id: string }>(
    create: () => Promise<T>,
    navigation: {
      remember: (id: string) => void;
      isCurrent: () => boolean;
      openCurrent: () => void;
      acceptedInBackground: () => void;
    },
  ): Promise<T> {
    if (this.pending) throw new Error("An upload is already in progress.");
    this.pending = true;
    try {
      const job = await create();
      // Page navigation does not revoke an accepted reconstruction request.
      this.acceptedId = job.id;
      navigation.remember(job.id);
      this.pending = false;
      if (navigation.isCurrent()) navigation.openCurrent();
      else navigation.acceptedInBackground();
      return job;
    } finally {
      this.pending = false;
    }
  }
}
