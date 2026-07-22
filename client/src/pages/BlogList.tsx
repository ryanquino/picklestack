import { useEffect, useState } from 'react';
import { getBlogPosts, type BlogPost } from '../api';
import BlogCard from '../components/BlogCard';
import Navbar from '../components/Navbar';
import ScrollToTopButton from '../components/ScrollToTopButton';

export default function BlogList() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getBlogPosts()
      .then(setPosts)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load posts'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="organizer-dashboard">
      <Navbar />
      <h1>Blog</h1>
      <p className="text-secondary">News, tips, and updates from the court</p>

      {loading && <p>Loading posts...</p>}
      {error && <p className="toast toast--error">{error}</p>}

      {!loading && !error && posts.length === 0 && (
        <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
          <p className="empty-state">No blog posts yet.</p>
        </div>
      )}

      <div className="blog-list">
        {posts.map((post) => (
          <BlogCard key={post.id} post={post} />
        ))}
      </div>
      <ScrollToTopButton />
    </div>
  );
}
