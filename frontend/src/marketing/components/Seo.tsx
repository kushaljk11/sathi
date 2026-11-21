import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

interface SeoProps { title: string; description: string; type?: 'website' | 'article'; image?: string }

const SITE = 'Sathi';

/** Sets a meta tag and returns a function restoring the previous state. */
function setMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  const created = !el;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  const prev = el.getAttribute('content');
  el.setAttribute('content', content);
  return () => {
    if (created) el!.remove();
    else if (prev != null) el!.setAttribute('content', prev);
  };
}

function setCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  const created = !el;
  if (!el) {
    el = document.createElement('link');
    el.rel = 'canonical';
    document.head.appendChild(el);
  }
  const prev = el.getAttribute('href');
  el.href = href;
  return () => {
    if (created) el!.remove();
    else if (prev != null) el!.setAttribute('href', prev);
  };
}

/** Per-page document metadata: title, description, Open Graph and canonical URL. Restores previous values on unmount. */
export function Seo({ title, description, type = 'website', image }: SeoProps) {
  const { pathname } = useLocation();
  useEffect(() => {
    const prevTitle = document.title;
    const fullTitle = title.includes(SITE) ? title : `${title} · ${SITE}`;
    const url = `${window.location.origin}${pathname}`;
    document.title = fullTitle;
    const restore = [
      setMeta('name', 'description', description),
      setMeta('property', 'og:title', fullTitle),
      setMeta('property', 'og:description', description),
      setMeta('property', 'og:type', type),
      setMeta('property', 'og:url', url),
      setMeta('property', 'og:site_name', SITE),
      ...(image ? [setMeta('property', 'og:image', new URL(image, window.location.origin).href)] : []),
      setCanonical(url),
    ];
    return () => {
      document.title = prevTitle;
      restore.forEach((r) => r());
    };
  }, [title, description, type, image, pathname]);
  return null;
}
