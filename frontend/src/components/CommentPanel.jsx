import React, { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Trash2 } from 'lucide-react';
import { commentsApi } from '../api';
import { LoadingSpinner, ErrorAlert, Avatar, timeAgo, useConfirm, useToast } from './common/UIComponents';


export const CommentPanel = ({ requestId, currentUserId, incomingCommentEvent }) => {
  const confirm = useConfirm();
  const toast = useToast();
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [newContent, setNewContent] = useState('');
  const [replyToId, setReplyToId] = useState(null);
  const [replyContent, setReplyContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchComments = async () => {
    if (!requestId) return;
    try {
      setLoading(true);
      setError('');
      const res = await commentsApi.list(requestId);
      setComments(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load comments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchComments();
  }, [requestId]);

  // Handle incoming real-time comment events from WebSocket
  useEffect(() => {
    if (!incomingCommentEvent) return;

    const { type, comment, comment_id, request_id } = incomingCommentEvent;

    // Only process if it matches current request
    if (request_id && request_id !== requestId) return;
    if (comment && comment.request_id !== requestId) return;

    if (type === 'comment' && comment) {
      setComments((prev) => {
        const exists = prev.some((c) => c.id === comment.id);
        if (exists) return prev;
        return [...prev, comment];
      });
    } else if (type === 'comment_updated' && comment) {
      setComments((prev) =>
        prev.map((c) => (c.id === comment.id ? comment : c))
      );
    } else if (type === 'comment_deleted' && comment_id) {
      setComments((prev) => prev.filter((c) => c.id !== comment_id && c.parent_comment_id !== comment_id));
    }
  }, [incomingCommentEvent, requestId]);

  const handlePostComment = async (e) => {
    e.preventDefault();
    if (!newContent.trim()) return;

    try {
      setSubmitting(true);
      const res = await commentsApi.create(requestId, {
        content: newContent.trim(),
        parent_comment_id: null,
      });
      setComments((prev) => {
        const exists = prev.some((c) => c.id === res.data.id);
        return exists ? prev : [...prev, res.data];
      });
      setNewContent('');
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to post comment');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePostReply = async (parentId) => {
    if (!replyContent.trim()) return;

    try {
      setSubmitting(true);
      const res = await commentsApi.create(requestId, {
        content: replyContent.trim(),
        parent_comment_id: parentId,
      });
      setComments((prev) => {
        const exists = prev.some((c) => c.id === res.data.id);
        return exists ? prev : [...prev, res.data];
      });
      setReplyToId(null);
      setReplyContent('');
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to post reply');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId) => {
    if (!(await confirm({ title: 'Delete comment', message: 'This comment will be removed for everyone.' }))) return;
    try {
      await commentsApi.delete(commentId);
      toast.success('Comment deleted');
      setComments((prev) => prev.filter((c) => c.id !== commentId && c.parent_comment_id !== commentId));
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to delete comment');
    }
  };

  // Group comments: top-level comments and replies
  const rootComments = comments.filter((c) => !c.parent_comment_id);
  const repliesByParent = comments.reduce((acc, c) => {
    if (c.parent_comment_id) {
      if (!acc[c.parent_comment_id]) acc[c.parent_comment_id] = [];
      acc[c.parent_comment_id].push(c);
    }
    return acc;
  }, {});

  return (
    <div className="flex flex-col h-full space-y-4">
      <ErrorAlert message={error} onDismiss={() => setError('')} />

      <form onSubmit={handlePostComment} className="flex gap-2 shrink-0">
        <input
          type="text"
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          placeholder="Add a comment on this request..."
          aria-label="New comment"
          className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-400/70 focus:ring-2 focus:ring-sky-400/20 transition"
        />
        <button
          type="submit"
          disabled={submitting || !newContent.trim()}
          className="px-4 py-2 bg-sky-500 hover:bg-sky-400 active:bg-sky-600 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
        >
          Post
        </button>
      </form>

      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {loading && comments.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <LoadingSpinner size="sm" text="Loading comments..." />
          </div>
        ) : rootComments.length === 0 ? (
          <div className="text-center py-10 text-slate-500 text-xs">
            No comments yet. Start the conversation.
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {rootComments.map((root) => {
              const replies = repliesByParent[root.id] || [];
              const isAuthor = root.user_id === currentUserId;

              return (
                <motion.div
                  key={root.id}
                  layout="position"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="bg-slate-900/70 border border-slate-800 rounded-lg p-3 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar name={root.username || `User #${root.user_id}`} />
                      <span className="font-semibold text-slate-100 truncate">
                        {root.username || `User #${root.user_id}`}
                      </span>
                      {isAuthor && <span className="px-1.5 py-px rounded bg-sky-500/10 text-sky-300 text-[9px] font-semibold">YOU</span>}
                      <span className="text-slate-500 text-[10px] shrink-0" title={new Date(root.created_at).toLocaleString()}>
                        {timeAgo(root.created_at)}
                        {root.is_edited && ' (edited)'}
                      </span>
                    </div>

                    {isAuthor && (
                      <button
                        type="button"
                        onClick={() => handleDelete(root.id)}
                        className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                        aria-label="Delete comment"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  <p className="text-slate-300 leading-relaxed whitespace-pre-wrap">{root.content}</p>

                  <div className="flex items-center gap-2 pt-1 border-t border-slate-800/60">
                    <button
                      type="button"
                      onClick={() => setReplyToId(replyToId === root.id ? null : root.id)}
                      className="text-[11px] text-sky-300 hover:text-sky-200 font-medium cursor-pointer"
                    >
                      Reply
                    </button>
                  </div>

                  <AnimatePresence initial={false}>
                    {replyToId === root.id && (
                      <motion.div
                        key="reply-form"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.15 }}
                        className="overflow-hidden"
                      >
                        <div className="flex gap-2 pt-2">
                          <input
                            type="text"
                            autoFocus
                            value={replyContent}
                            onChange={(e) => setReplyContent(e.target.value)}
                            placeholder={`Reply to ${root.username || 'comment'}...`}
                            aria-label="Reply"
                            className="flex-1 bg-slate-950 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-400/70 focus:ring-2 focus:ring-sky-400/20 transition"
                          />
                          <button
                            type="button"
                            onClick={() => handlePostReply(root.id)}
                            disabled={submitting || !replyContent.trim()}
                            className="px-2.5 py-1.5 bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-slate-950 rounded-md text-[11px] font-semibold cursor-pointer transition-colors"
                          >
                            Reply
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setReplyToId(null);
                              setReplyContent('');
                            }}
                            className="px-2 py-1.5 text-slate-400 hover:text-slate-200 text-[11px] cursor-pointer transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {replies.length > 0 && (
                    <div className="space-y-2 pl-3 border-l-2 border-slate-800 mt-2">
                      {replies.map((reply) => (
                        <div key={reply.id} className="space-y-1">
                          <div className="flex items-center justify-between text-[10px]">
                            <div className="flex items-center gap-2 min-w-0">
                              <Avatar size="sm" name={reply.username || `User #${reply.user_id}`} />
                              <span className="font-semibold text-slate-200 truncate">
                                {reply.username || `User #${reply.user_id}`}
                              </span>
                              <span className="text-slate-500 shrink-0">{timeAgo(reply.created_at)}</span>
                            </div>
                            {reply.user_id === currentUserId && (
                              <button
                                type="button"
                                onClick={() => handleDelete(reply.id)}
                                className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                                aria-label="Delete reply"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                          <p className="text-slate-300 leading-relaxed">{reply.content}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
};
