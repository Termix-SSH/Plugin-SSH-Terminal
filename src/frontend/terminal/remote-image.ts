import { useEffect, useState } from "react";

// Termix 26.11.2 keeps plugin views from loading pictures from other sites,
// so they come through Termix and show from a blob: URL.
const loaded = new Map<string, Promise<string | null>>();

function load(url: string): Promise<string | null> {
  let pending = loaded.get(url);
  if (!pending) {
    pending = fetch(
      `/plugins/ssh-terminal/image?url=${encodeURIComponent(url)}`,
    )
      .then(async (response) =>
        response.ok ? URL.createObjectURL(await response.blob()) : null,
      )
      .catch(() => null);
    loaded.set(url, pending);
    // A failure is tried again the next time the picture is asked for.
    void pending.then((src) => {
      if (!src) loaded.delete(url);
    });
  }
  return pending;
}

/**
 * The picture at url, ready to show: undefined while it loads, null when it
 * can't be shown.
 */
export function useRemoteImage(
  url: string | null | undefined,
): string | null | undefined {
  const [src, setSrc] = useState<string | null | undefined>(
    url ? undefined : null,
  );
  useEffect(() => {
    if (!url) {
      setSrc(null);
      return;
    }
    if (/^(data|blob):/i.test(url)) {
      setSrc(url);
      return;
    }
    let live = true;
    setSrc(undefined);
    void load(url).then((value) => {
      if (live) setSrc(value);
    });
    return () => {
      live = false;
    };
  }, [url]);
  return src;
}
