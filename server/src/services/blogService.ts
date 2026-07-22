import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const BLOG_DIR = path.join(import.meta.dirname || __dirname, '..', 'blog');
const POSTS_FILE = path.join(BLOG_DIR, 'posts.json');
const COMMENTS_FILE = path.join(BLOG_DIR, 'comments.json');
const IMAGES_DIR = path.join(BLOG_DIR, 'images');

export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  coverImage: string | null;
  author: string;
  createdAt: string;
  updatedAt: string;
}

export interface BlogComment {
  id: string;
  postId: string;
  author: string;
  content: string;
  createdAt: string;
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJson<T>(file: string): T[] {
  ensureDir(path.dirname(file));
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, '[]', 'utf-8');
    return [];
  }
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function writeJson<T>(file: string, data: T[]) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}

// Posts

export function getAllPosts(): BlogPost[] {
  return readJson<BlogPost>(POSTS_FILE).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function getPostBySlug(slug: string): BlogPost | null {
  return readJson<BlogPost>(POSTS_FILE).find((p) => p.slug === slug) || null;
}

export function getPostById(id: string): BlogPost | null {
  return readJson<BlogPost>(POSTS_FILE).find((p) => p.id === id) || null;
}

export function createPost(data: {
  title: string;
  content: string;
  excerpt?: string;
  coverImage?: string | null;
  author?: string;
}): BlogPost {
  const posts = readJson<BlogPost>(POSTS_FILE);
  const now = new Date().toISOString();
  const slug = data.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const post: BlogPost = {
    id: uuidv4(),
    title: data.title,
    slug,
    content: data.content,
    excerpt: data.excerpt || data.content.slice(0, 200).replace(/[#*_`]/g, '') + '...',
    coverImage: data.coverImage || null,
    author: data.author || 'Admin',
    createdAt: now,
    updatedAt: now,
  };

  posts.push(post);
  writeJson(POSTS_FILE, posts);
  return post;
}

export function updatePost(
  id: string,
  data: Partial<Pick<BlogPost, 'title' | 'content' | 'excerpt' | 'coverImage' | 'author'>>
): BlogPost | null {
  const posts = readJson<BlogPost>(POSTS_FILE);
  const idx = posts.findIndex((p) => p.id === id);
  if (idx === -1) return null;

  const post = posts[idx];
  if (data.title !== undefined) {
    post.title = data.title;
    post.slug = data.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
  if (data.content !== undefined) post.content = data.content;
  if (data.excerpt !== undefined) post.excerpt = data.excerpt;
  if (data.coverImage !== undefined) post.coverImage = data.coverImage;
  if (data.author !== undefined) post.author = data.author;
  post.updatedAt = new Date().toISOString();

  posts[idx] = post;
  writeJson(POSTS_FILE, posts);
  return post;
}

export function deletePost(id: string): boolean {
  const posts = readJson<BlogPost>(POSTS_FILE);
  const idx = posts.findIndex((p) => p.id === id);
  if (idx === -1) return false;
  posts.splice(idx, 1);
  writeJson(POSTS_FILE, posts);
  // Also delete associated comments
  const comments = readJson<BlogComment>(COMMENTS_FILE);
  const filtered = comments.filter((c) => c.postId !== id);
  writeJson(COMMENTS_FILE, filtered);
  return true;
}

// Comments

export function getCommentsByPostId(postId: string): BlogComment[] {
  return readJson<BlogComment>(COMMENTS_FILE)
    .filter((c) => c.postId === postId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export function addComment(
  postId: string,
  data: { author: string; content: string }
): BlogComment | null {
  const posts = readJson<BlogPost>(POSTS_FILE);
  if (!posts.find((p) => p.id === postId)) return null;

  const comments = readJson<BlogComment>(COMMENTS_FILE);
  const comment: BlogComment = {
    id: uuidv4(),
    postId,
    author: data.author,
    content: data.content,
    createdAt: new Date().toISOString(),
  };
  comments.push(comment);
  writeJson(COMMENTS_FILE, comments);
  return comment;
}

// Images

export function saveImage(filename: string, buffer: Buffer): string {
  ensureDir(IMAGES_DIR);
  const ext = path.extname(filename);
  const safeName = `${uuidv4()}${ext}`;
  fs.writeFileSync(path.join(IMAGES_DIR, safeName), buffer);
  return `/api/blog/images/${safeName}`;
}

export function getImagePath(filename: string): string | null {
  const filePath = path.join(IMAGES_DIR, filename);
  if (!fs.existsSync(filePath)) return null;
  return filePath;
}
