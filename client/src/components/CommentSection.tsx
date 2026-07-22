import { useState } from 'react';
import type { BlogComment } from '../api';
import { addBlogComment } from '../api';

interface CommentSectionProps {
  postId: string;
  comments: BlogComment[];
  onCommentAdded: (comment: BlogComment) => void;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function CommentSection({ postId, comments, onCommentAdded }: CommentSectionProps) {
  const [author, setAuthor] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!author.trim() || !content.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const comment = await addBlogComment(postId, {
        author: author.trim(),
        content: content.trim(),
      });
      onCommentAdded(comment);
      setContent('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post comment');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="blog-comments" aria-label="Comments">
      <h3 className="blog-comments__title">Comments ({comments.length})</h3>

      <form onSubmit={handleSubmit} className="blog-comments__form">
        <input
          type="text"
          placeholder="Your name"
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          className="blog-comments__input"
          required
        />
        <textarea
          placeholder="Write a comment..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="blog-comments__textarea"
          rows={3}
          required
        />
        {error && <p className="blog-comments__error">{error}</p>}
        <button
          type="submit"
          disabled={loading || !author.trim() || !content.trim()}
          className="btn btn--primary"
        >
          {loading ? 'Posting...' : 'Post Comment'}
        </button>
      </form>

      <div className="blog-comments__list">
        {comments.length === 0 && (
          <p className="blog-comments__empty">No comments yet. Be the first!</p>
        )}
        {comments.map((comment) => (
          <div key={comment.id} className="blog-comment card">
            <div className="blog-comment__header">
              <span className="blog-comment__author">{comment.author}</span>
              <span className="blog-comment__date">{formatDate(comment.createdAt)}</span>
            </div>
            <p className="blog-comment__content">{comment.content}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
