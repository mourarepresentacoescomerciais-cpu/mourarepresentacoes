import { useEffect, useState } from 'react';

type Props = {
  src?: string | null;
  alt?: string;
  className?: string;
};

/**
 * Thumbnail that gracefully falls back to an "IMG" placeholder when the
 * image is missing or fails to load. Uses React state (not imperative DOM
 * mutation) so it stays correct across re-renders and row re-mounts.
 */
export function ProductThumb({ src, alt = '', className = 'w-9 h-9' }: Props) {
  const [failed, setFailed] = useState(false);

  // Reset the failed flag whenever the source changes.
  useEffect(() => {
    setFailed(false);
  }, [src]);

  const showImage = !!src && !failed;

  if (showImage) {
    return (
      <img
        src={src as string}
        alt={alt}
        loading="lazy"
        decoding="async"
        className={`${className} object-cover rounded`}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      className={`${className} bg-gray-100 rounded flex items-center justify-center text-[10px] text-[#6b7280]`}
    >
      IMG
    </div>
  );
}
