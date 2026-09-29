import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { getPageMetadata } from '../data/pageMetadata';
import { IS_REVIEW_PREVIEW } from '../lib/preview';

export default function PageMetadata() {
  const { pathname } = useLocation();
  useEffect(() => {
    const meta = getPageMetadata(pathname, { preview: IS_REVIEW_PREVIEW, assetBase: import.meta.env.BASE_URL });
    document.title = meta.title;
    const set = (attribute, key, value) => {
      let element = document.head.querySelector(`meta[${attribute}="${key}"]`);
      if (!element) { element = document.createElement('meta'); element.setAttribute(attribute, key); document.head.append(element); }
      element.content = value;
    };
    set('name', 'description', meta.description); set('name', 'robots', meta.robots);
    for (const [key, value] of Object.entries({ 'og:title': meta.title, 'og:description': meta.description, 'og:url': meta.canonical, 'og:image': meta.image, 'og:image:alt': meta.imageAlt, 'og:image:width': '1200', 'og:image:height': '630', 'og:type': 'website', 'og:locale': 'ko_KR' })) set('property', key, value);
    set('name', 'twitter:card', 'summary_large_image'); set('name', 'twitter:title', meta.title); set('name', 'twitter:description', meta.description); set('name', 'twitter:image', meta.image);
    let canonical = document.head.querySelector('link[rel="canonical"]');
    if (!canonical) { canonical = document.createElement('link'); canonical.rel = 'canonical'; document.head.append(canonical); }
    canonical.href = meta.canonical;
  }, [pathname]);
  return null;
}
