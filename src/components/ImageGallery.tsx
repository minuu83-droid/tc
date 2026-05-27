'use client';

import { useState, useEffect, useCallback } from 'react';

interface ImageGalleryProps {
  urls: string[] | null | undefined;
  emptyText?: string;
}

export default function ImageGallery({ urls, emptyText = '첨부 사진 없음' }: ImageGalleryProps) {
  const images = (urls ?? []).filter(Boolean);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const close = useCallback(() => setLightboxIdx(null), []);
  const prev  = useCallback(() =>
    setLightboxIdx(i => i === null ? null : (i - 1 + images.length) % images.length),
    [images.length]);
  const next  = useCallback(() =>
    setLightboxIdx(i => i === null ? null : (i + 1) % images.length),
    [images.length]);

  /* 키보드 이벤트 */
  useEffect(() => {
    if (lightboxIdx === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape')     close();
      if (e.key === 'ArrowLeft')  prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [lightboxIdx, close, prev, next]);

  /* 이미지 없음 */
  if (images.length === 0) {
    return (
      <p className="text-sm text-gray-400 italic">{emptyText}</p>
    );
  }

  return (
    <>
      {/* ── 썸네일 목록 ── */}
      <div className="flex flex-wrap gap-2">
        {images.map((url, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => setLightboxIdx(idx)}
            className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200 hover:border-blue-400 hover:shadow-md transition-all group flex-shrink-0"
            aria-label={`사진 ${idx + 1} 크게 보기`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={`첨부 사진 ${idx + 1}`} className="w-full h-full object-cover" />
            {/* 호버 오버레이 */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
              <svg className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow"
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </div>
            {/* 장수 뱃지 */}
            {images.length > 1 && (
              <span className="absolute bottom-1 right-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded-full leading-none">
                {idx + 1}/{images.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── 라이트박스 ── */}
      {lightboxIdx !== null && (
        <div
          className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center"
          onClick={close}
        >
          <div
            className="relative flex items-center justify-center w-full h-full px-16"
            onClick={e => e.stopPropagation()}
          >
            {/* 메인 이미지 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={images[lightboxIdx]}
              alt={`첨부 사진 ${lightboxIdx + 1}`}
              className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl select-none"
            />

            {/* 카운터 */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/60 text-white text-sm px-4 py-1.5 rounded-full">
              {lightboxIdx + 1} / {images.length}
            </div>

            {/* 닫기 */}
            <button
              onClick={close}
              className="absolute top-4 right-4 bg-black/60 hover:bg-black/80 text-white w-9 h-9 rounded-full flex items-center justify-center text-xl leading-none transition-colors"
              aria-label="닫기"
            >
              ×
            </button>

            {/* 이전 */}
            {images.length > 1 && (
              <button
                onClick={prev}
                className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white w-11 h-11 rounded-full flex items-center justify-center text-2xl leading-none transition-colors select-none"
                aria-label="이전 사진"
              >
                ‹
              </button>
            )}

            {/* 다음 */}
            {images.length > 1 && (
              <button
                onClick={next}
                className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white w-11 h-11 rounded-full flex items-center justify-center text-2xl leading-none transition-colors select-none"
                aria-label="다음 사진"
              >
                ›
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
