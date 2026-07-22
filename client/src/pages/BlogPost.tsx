import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getBlogPost, type BlogPost, type BlogComment } from '../api';
import MarkdownRenderer from '../components/MarkdownRenderer';
import CommentSection from '../components/CommentSection';
import Navbar from '../components/Navbar';
import ScrollToTopButton from '../components/ScrollToTopButton';

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPost = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    try {
      const data = await getBlogPost(slug);
      setPost(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Post not found');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    fetchPost();
  }, [fetchPost]);

  if (loading) {
    return (
      <div className="organizer-dashboard">
        <Navbar />
        <p>Loading post...</p>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="organizer-dashboard">
        <Navbar />
        <h1>Post not found</h1>
        <p>{error || 'The blog post you are looking for does not exist.'}</p>
        <Link to="/blog" className="btn btn--primary">Back to Blog</Link>
      </div>
    );
  }

  return (
    <div className="organizer-dashboard">
      <Navbar />
      <article className="blog-post">
        <Link to="/blog" className="blog-post__back">← Back to Blog</Link>
        {post.coverImage && (
          <img src={post.coverImage} alt={post.title} className="blog-post__cover" />
        )}
        <h1 className="blog-post__title">{post.title}</h1>
        <div className="blog-post__meta">
          <span className="blog-post__author">By {post.author}</span>
          <span className="blog-post__date">{formatDate(post.createdAt)}</span>
          {post.updatedAt !== post.createdAt && (
            <span className="blog-post__updated">(edited {formatDate(post.updatedAt)})</span>
          )}
        </div>
        <div className="blog-post__content card">
          <MarkdownRenderer content={post.content} />
        </div>
        <CommentSection
          postId={post.id}
          comments={post.comments || []}
          onCommentAdded={(comment: BlogComment) => {
            setPost((prev) =>
              prev ? { ...prev, comments: [...(prev.comments || []), comment] } : prev
            );
          }}
        />
      </article>
      <ScrollToTopButton />
    </div>
  );
}
