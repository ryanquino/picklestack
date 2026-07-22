import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  getBlogPost,
  createBlogPost,
  updateBlogPost,
  deleteBlogPost,
  uploadBlogImage,
  type BlogPost,
} from '../api';
import MarkdownRenderer from '../components/MarkdownRenderer';
import Navbar from '../components/Navbar';

export default function BlogEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEditing = Boolean(id);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [author, setAuthor] = useState('');
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing && id) {
      getBlogPost(id)
        .then((post) => {
          setTitle(post.title);
          setContent(post.content);
          setExcerpt(post.excerpt);
          setAuthor(post.author);
          setCoverImage(post.coverImage);
        })
        .catch(() => setError('Failed to load post'));
    }
  }, [id, isEditing]);

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await uploadBlogImage(file);
      setCoverImage(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  function handleInsertMarkdown(type: 'bold' | 'italic' | 'heading' | 'link' | 'image' | 'code' | 'list') {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = content.slice(start, end);
    let insertion = '';

    switch (type) {
      case 'bold': insertion = `**${selected || 'bold text'}**`; break;
      case 'italic': insertion = `*${selected || 'italic text'}*`; break;
      case 'heading': insertion = `## ${selected || 'Heading'}`; break;
      case 'link': insertion = `[${selected || 'link text'}](url)`; break;
      case 'image': insertion = `![${selected || 'alt text'}](image-url)`; break;
      case 'code': insertion = selected.includes('\n') ? `\`\`\`\n${selected || 'code'}\n\`\`\`` : `\`${selected || 'code'}\``; break;
      case 'list': insertion = `\n- ${selected || 'list item'}`; break;
    }

    const newContent = content.slice(0, start) + insertion + content.slice(end);
    setContent(newContent);
    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = start + insertion.length;
      textarea.selectionEnd = start + insertion.length;
    }, 0);
  }

  async function handleSave() {
    if (!title.trim() || !content.trim()) {
      setError('Title and content are required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (isEditing && id) {
        const post = await updateBlogPost(id, {
          title: title.trim(),
          content: content.trim(),
          excerpt: excerpt.trim() || undefined,
          author: author.trim() || undefined,
          coverImage,
        });
        navigate(`/blog/${post.slug}`);
      } else {
        const post = await createBlogPost({
          title: title.trim(),
          content: content.trim(),
          excerpt: excerpt.trim() || undefined,
          author: author.trim() || undefined,
          coverImage,
        });
        navigate(`/blog/${post.slug}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!id || !window.confirm('Are you sure you want to delete this post?')) return;
    try {
      await deleteBlogPost(id);
      navigate('/blog');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  }

  return (
    <div className="organizer-dashboard">
      <Navbar />
      <h1>{isEditing ? 'Edit Post' : 'New Post'}</h1>

      <div className="blog-editor">
        <div className="blog-editor__toolbar">
          <button onClick={() => handleInsertMarkdown('bold')} className="btn btn--secondary btn--sm" title="Bold">B</button>
          <button onClick={() => handleInsertMarkdown('italic')} className="btn btn--secondary btn--sm" title="Italic"><i>I</i></button>
          <button onClick={() => handleInsertMarkdown('heading')} className="btn btn--secondary btn--sm" title="Heading">H</button>
          <button onClick={() => handleInsertMarkdown('link')} className="btn btn--secondary btn--sm" title="Link">🔗</button>
          <button onClick={() => handleInsertMarkdown('image')} className="btn btn--secondary btn--sm" title="Image">🖼</button>
          <button onClick={() => handleInsertMarkdown('code')} className="btn btn--secondary btn--sm" title="Code">{'<>'}</button>
          <button onClick={() => handleInsertMarkdown('list')} className="btn btn--secondary btn--sm" title="List">☰</button>
          <button
            onClick={() => setShowPreview(!showPreview)}
            className={`btn btn--sm ${showPreview ? 'btn--primary' : 'btn--secondary'}`}
          >
            {showPreview ? 'Write' : 'Preview'}
          </button>
        </div>

        <div className="blog-editor__fields">
          <input
            type="text"
            placeholder="Post title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="blog-editor__title-input"
          />
          <input
            type="text"
            placeholder="Author name (optional)"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            className="blog-editor__author-input"
          />
          <textarea
            placeholder="Excerpt (optional — auto-generated if empty)"
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
            className="blog-editor__excerpt-input"
            rows={2}
          />

          <div className="blog-editor__cover">
            {coverImage && (
              <img src={coverImage} alt="Cover" className="blog-editor__cover-preview" />
            )}
            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              onChange={handleImageUpload}
              style={{ display: 'none' }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="btn btn--secondary"
            >
              {uploading ? 'Uploading...' : coverImage ? 'Change Cover Image' : 'Upload Cover Image'}
            </button>
            {coverImage && (
              <button onClick={() => setCoverImage(null)} className="btn btn--secondary" style={{ color: '#ef4444' }}>
                Remove
              </button>
            )}
          </div>

          {showPreview ? (
            <div className="blog-editor__preview card">
              <MarkdownRenderer content={content || '*Nothing to preview*'} />
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              placeholder="Write your post in Markdown..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="blog-editor__content-input"
              rows={20}
            />
          )}
        </div>

        {error && <p className="toast toast--error">{error}</p>}

        <div className="blog-editor__actions">
          <button onClick={handleSave} disabled={saving || !title.trim() || !content.trim()} className="btn btn--primary">
            {saving ? 'Saving...' : isEditing ? 'Update Post' : 'Publish Post'}
          </button>
          {isEditing && (
            <button onClick={handleDelete} className="btn btn--secondary" style={{ color: '#ef4444' }}>
              Delete Post
            </button>
          )}
          <Link to="/blog" className="btn btn--secondary">Cancel</Link>
        </div>
      </div>
    </div>
  );
}
