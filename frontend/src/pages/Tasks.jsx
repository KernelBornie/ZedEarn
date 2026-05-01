import { useState, useEffect } from 'react';
import api from '../api/axios';

const TYPE_LABELS = {
  product: '📦 Product Review',
  survey: '📋 Survey',
  adwatch: '📺 Ad Watch',
  sponsored: '💼 Sponsored',
  daily_checkin: '✅ Daily Check-In',
  weekly_mission: '🎯 Weekly Mission',
  referral: '👥 Referral',
  team: '🤝 Team',
};

export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState({});
  const [messages, setMessages] = useState({});
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ pages: 1, total: 0 });

  const fetchTasks = (p = 1, type = '') => {
    setLoading(true);
    const params = { page: p, limit: 12 };
    if (type) params.type = type;
    api.get('/api/tasks', { params })
      .then((res) => {
        setTasks(res.data.tasks);
        setPagination({ pages: res.data.pages, total: res.data.total });
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchTasks(page, filter); }, [page, filter]);

  const completeTask = async (taskId, taskTitle) => {
    setCompleting((prev) => ({ ...prev, [taskId]: true }));
    try {
      const res = await api.post(`/api/tasks/${taskId}/complete`);
      setMessages((prev) => ({
        ...prev,
        [taskId]: { type: 'success', text: res.data.message },
      }));
    } catch (err) {
      setMessages((prev) => ({
        ...prev,
        [taskId]: { type: 'error', text: err.response?.data?.message || 'Failed to complete task' },
      }));
    } finally {
      setCompleting((prev) => ({ ...prev, [taskId]: false }));
    }
  };

  const TASK_TYPES = ['product', 'survey', 'adwatch', 'sponsored', 'daily_checkin', 'weekly_mission', 'referral', 'team'];

  return (
    <div className="page-content">
      <h1 className="page-title">Available Tasks</h1>

      {/* Filter */}
      <div style={{ marginBottom: 20, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          className={filter === '' ? 'btn-primary' : 'btn-outline'}
          style={{ padding: '6px 14px', fontSize: '0.85rem' }}
          onClick={() => { setFilter(''); setPage(1); }}
        >
          All
        </button>
        {TASK_TYPES.map((t) => (
          <button
            key={t}
            className={filter === t ? 'btn-primary' : 'btn-outline'}
            style={{ padding: '6px 14px', fontSize: '0.85rem' }}
            onClick={() => { setFilter(t); setPage(1); }}
          >
            {TYPE_LABELS[t] || t}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" /></div>
      ) : tasks.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>
          No tasks available right now. Upgrade your VIP tier to unlock more tasks!
        </div>
      ) : (
        <>
          <p style={{ color: '#6b7280', marginBottom: 16, fontSize: '0.9rem' }}>{pagination.total} tasks available</p>
          <div className="tasks-grid">
            {tasks.map((task) => {
              const msg = messages[task._id];
              return (
                <div key={task._id} className="task-card">
                  <p className="task-title">{task.title}</p>
                  <p style={{ fontSize: '0.78rem', color: '#6c63ff', marginBottom: 6 }}>
                    {TYPE_LABELS[task.type] || task.type}
                  </p>
                  <p className="task-desc">{task.description}</p>
                  <div className="task-meta">
                    <span className="reward">+ZMW {task.reward?.toFixed(2)}</span>
                    {task.vipRequired !== 'none' && (
                      <span className={`badge badge-${task.vipRequired}`}>{task.vipRequired} required</span>
                    )}
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    {task.tags?.map((tag) => (
                      <span key={tag} className="task-tag">{tag}</span>
                    ))}
                  </div>
                  <p style={{ fontSize: '0.78rem', color: '#6b7280', marginBottom: 10 }}>
                    Daily limit: {task.dailyLimit} · Cooldown: {task.cooldownMinutes > 0 ? `${task.cooldownMinutes}min` : 'None'}
                  </p>

                  {msg && (
                    <p className={msg.type === 'success' ? 'success-msg' : 'error-msg'} style={{ marginBottom: 8 }}>
                      {msg.text}
                    </p>
                  )}

                  <button
                    className="btn-success"
                    style={{ width: '100%' }}
                    onClick={() => completeTask(task._id, task.title)}
                    disabled={completing[task._id] || msg?.type === 'success'}
                  >
                    {completing[task._id] ? <span className="spinner" /> : msg?.type === 'success' ? '✓ Completed' : 'Complete Task'}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {pagination.pages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 24 }}>
              <button
                className="btn-outline"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                ← Prev
              </button>
              <span style={{ padding: '10px 16px', fontWeight: 600 }}>
                {page} / {pagination.pages}
              </span>
              <button
                className="btn-outline"
                disabled={page === pagination.pages}
                onClick={() => setPage(page + 1)}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
