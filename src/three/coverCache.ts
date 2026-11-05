import type { Project } from '../data/projects';
import { drawCover } from './drawCover';

// Обложка рисуется один раз на сессию и переиспользуется ящиком и проигрывателем.
const cache = new Map<string, HTMLCanvasElement>();

export function coverCanvas(project: Project, code: string, size: number) {
  const key = `${project.id}:${size}`;
  let cv = cache.get(key);
  if (!cv) {
    cv = drawCover(project, code, size);
    cache.set(key, cv);
  }
  return cv;
}
