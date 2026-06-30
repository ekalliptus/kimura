import { useId, useRef, useState } from 'react';
import { t as tr, type AdminLang } from '~/lib/admin-i18n';

const MAX_EDGE = 1920;
const MAX_BYTES = 2_000_000;

/**
 * Compress an image file in the browser before upload: decode (honouring EXIF
 * orientation), scale so the longest edge ≤ 1920px, re-encode as WebP. Returns a
 * Blob. Degrades gracefully — if decode/encode isn't supported (e.g. HEIC in some
 * browsers), returns the original File and lets the edge optimizer handle it.
 */
async function compress(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      return file; // undecodable (HEIC etc.) — upload original, server still validates.
    }
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const toBlob = (type: string, q: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, q));

  const webp = await toBlob('image/webp', 0.82);
  if (webp) return webp;
  const jpeg = await toBlob('image/jpeg', 0.85);
  if (jpeg) return jpeg;
  return file;
}

type Status = 'compressing' | 'uploading';

/**
 * Controlled image uploader. `value` is the list of stored public URLs; each
 * picked file is compressed, POSTed to /api/admin/images, and its returned URL
 * appended. `onBusyChange` lets the parent disable Save while any upload runs.
 */
export default function ImageUploader({
  value,
  onChange,
  onBusyChange,
  lang,
}: {
  value: string[];
  onChange: (urls: string[]) => void;
  onBusyChange?: (busy: boolean) => void;
  lang: AdminLang;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ id: string; name: string; status: Status }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ''; // allow re-picking the same file
    if (!files.length) return;
    setError(null);

    const next = [...value];
    for (const file of files) {
      const id = crypto.randomUUID();
      setPending((p) => [...p, { id, name: file.name, status: 'compressing' }]);
      onBusyChange?.(true);
      try {
        const blob = await compress(file);
        if (blob.size > MAX_BYTES) {
          setError(tr(lang, 'rm.img_too_big'));
          continue;
        }
        if (!blob.type.startsWith('image/')) {
          setError(tr(lang, 'rm.img_bad_type'));
          continue;
        }
        setPending((p) => p.map((x) => (x.id === id ? { ...x, status: 'uploading' } : x)));

        const ext = blob.type.split('/')[1]?.split('+')[0] || 'webp';
        const fd = new FormData();
        fd.append('file', new File([blob], `${id}.${ext}`, { type: blob.type }));
        const res = await fetch('/api/admin/images', { method: 'POST', body: fd });
        if (!res.ok) {
          setError(tr(lang, 'rm.img_failed'));
          continue;
        }
        const { url } = (await res.json()) as { url: string };
        next.push(url);
        onChange([...next]);
      } catch {
        setError(tr(lang, 'rm.img_failed'));
      } finally {
        setPending((p) => {
          const remaining = p.filter((x) => x.id !== id);
          if (remaining.length === 0) onBusyChange?.(false);
          return remaining;
        });
      }
    }
  }

  function remove(url: string) {
    onChange(value.filter((u) => u !== url));
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {value.map((url) => (
          <div key={url} className="group relative size-20 overflow-hidden rounded-md border border-border bg-muted">
            <img src={url} alt="" className="size-full object-cover" />
            <button
              type="button"
              onClick={() => remove(url)}
              className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-background/80 text-xs text-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
              aria-label={tr(lang, 'rm.img_remove')}
            >
              ✕
            </button>
          </div>
        ))}
        {pending.map((p) => (
          <div key={p.id} className="flex size-20 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border bg-muted/40 text-[10px] text-muted-foreground">
            <span className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-accent" />
            {tr(lang, p.status === 'compressing' ? 'rm.img_compressing' : 'rm.img_uploading')}
          </div>
        ))}
        <label
          htmlFor={inputId}
          className="flex size-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-xs text-muted-foreground transition-colors hover:border-accent hover:text-accent"
        >
          <span className="text-lg leading-none">+</span>
          {tr(lang, 'rm.img_add')}
        </label>
      </div>
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={onPick}
        className="hidden"
      />
      {error ? <p className="text-xs text-destructive">{error}</p> : <p className="text-xs text-muted-foreground">{tr(lang, 'rm.img_hint')}</p>}
    </div>
  );
}
