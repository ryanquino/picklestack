import { Link } from 'react-router-dom';
import type { BlogPost } from '../api';

interface BlogCardProps {
  post: BlogPost;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function BlogCard({ post }: BlogCardProps) {
  return (
    <Link to={`/blog/${post.slug}`} className="blog-card card">
      {post.coverImage && (
        <img src={post.coverImage} alt={post.title} className="blog-card__cover" />
      )}
      <div className="blog-card__body">
        <h3 className="blog-card__title">{post.title}</h3>
        <p className="blog-card__excerpt">{post.excerpt}</p>
        <div className="blog-card__meta">
          <span className="blog-card__author">{post.author}</span>
          <span className="blog-card__date">{formatDate(post.createdAt)}</span>
        </div>
      </div>
    </Link>
  );
}
