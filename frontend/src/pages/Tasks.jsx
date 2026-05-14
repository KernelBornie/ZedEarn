import { useState, useEffect } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

const TYPE_LABELS = {
  ad_watch: '📺 Watch Ad',
  survey: '📋 Survey',
  daily_checkin: '✅ Daily Check-In',
  referral: '👥 Referral',
  mission: '🎯 Mission',
};

export default function Tasks() {
  const { refreshUser } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState({});
  const [messages, setMessages] = useState({});
  const [filter, setFilter] = useState('');
  const [wallet, setWallet] = useState(null);

  const fetchTasks = (type = '') => {
    setLoading(true);
    const params = {};
    if (type) params.type = type;
    api.get('/tasks', { params })
      .then((res) => {
        setTasks(res.data.tasks);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  const fetchWallet = () => {
    api.get('/wallet')
      .then((res) => setWallet(res.data.wallet))
      .catch(console.error);
  };

  useEffect(() => {
    fetchTasks(filter);
  }, [filter]);

  useEffect(() => {
    fetchWallet();
  }, []);

  const completeTask = async (taskId) => {
    setCompleting((prev) => ({ ...prev, [taskId]: true }));
    try {
      const res = await api.post(`/tasks/complete/${taskId}`);
      setMessages((prev) => ({
        ...prev,
        [taskId]: { type: 'success', text: res.data.message },
      }));
      setTasks((prev) =>
        prev.map((task) => {
          if (task._id !== taskId) return task;
          const status = task.userStatus || {};
          const max = task.maxCompletionsPerUser ?? 1;
          const nextCount = (status.completionCount || 0) + 1;
          const remaining = max > 0 ? Math.max(0, max - nextCount) : null;
          const cooldownActive = task.cooldownHours > 0;
          const nextAvailableAt = cooldownActive
            ? new Date(Date.now() + task.cooldownHours * 60 * 60 * 1000).toISOString()
            : status.nextAvailableAt;
          return {
            ...task,
            userStatus: {
              ...status,
              completionCount: nextCount,
              remainingAvailability: remaining,
              isCompleted: max > 0 ? nextCount >= max : false,
              canComplete: false,
              cooldownActive,
              nextAvailableAt,
            },
          };
        })
      );
      if (res.data.wallet) setWallet(res.data.wallet);
      window.dispatchEvent(new CustomEvent('wallet:refresh', { detail: { source: 'tasks', wallet: res.data.wallet } }));
      await refreshUser().catch(() => null);
      fetchTasks(filter);
    } catch (err) {
      setMessages((prev) => ({
        ...prev,
        [taskId]: { type: 'error', text: err.response?.data?.message || 'Failed to complete task' },
      }));
    } finally {
      setCompleting((prev) => ({ ...prev, [taskId]: false }));
    }
  };

  const TASK_TYPES = ['ad_watch', 'survey', 'daily_checkin', 'referral', 'mission'];

  return (
    <div className="page-content">
      <h1 className="page-title">Available Tasks</h1>

      {wallet && (
        <div className="card" style={{ marginBottom: 16, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <p style={{ fontSize: '0.78rem', color: '#6b7280' }}>Balance</p>
            <p style={{ fontWeight: 700 }}>ZMW {wallet.balance?.toFixed(2)}</p>
          </div>
          <div>
            <p style={{ fontSize: '0.78rem', color: '#6b7280' }}>Lifetime Earnings</p>
            <p style={{ fontWeight: 700 }}>ZMW {wallet.lifetimeEarnings?.toFixed(2)}</p>
          </div>
        </div>
      )}

      {/* Filter */}
      <div style={{ marginBottom: 20, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          className={filter === '' ? 'btn-primary' : 'btn-outline'}
          style={{ padding: '6px 14px', fontSize: '0.85rem' }}
          onClick={() => { setFilter(''); }}
        >
          All
        </button>
        {TASK_TYPES.map((t) => (
          <button
            key={t}
            className={filter === t ? 'btn-primary' : 'btn-outline'}
            style={{ padding: '6px 14px', fontSize: '0.85rem' }}
            onClick={() => { setFilter(t); }}
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
          <p style={{ color: '#6b7280', marginBottom: 16, fontSize: '0.9rem' }}>{tasks.length} tasks available</p>
          <div className="tasks-grid">
            {tasks.map((task) => {
              const msg = messages[task._id];
              const status = task.userStatus || {};
              const remaining = status.remainingAvailability;
              const remainingLabel = remaining === null ? 'Unlimited' : remaining === 0 ? 'No uses left' : remaining;
              const cooldownLabel = task.cooldownHours > 0 ? `${task.cooldownHours}h` : 'None';
              const isDisabled = completing[task._id] || msg?.type === 'success' || !status.canComplete;
              let buttonLabel = 'Unavailable';
              if (msg?.type === 'success') buttonLabel = '✓ Completed';
              else if (status.canComplete) buttonLabel = 'Complete Task';
              else if (status.vipBlocked) buttonLabel = 'VIP Only';
              else if (status.isCompleted) buttonLabel = 'Completed';
              return (
                <div key={task._id} className="task-card">
                  <p className="task-title">{task.title}</p>
                  <p style={{ fontSize: '0.78rem', color: '#6c63ff', marginBottom: 6 }}>
                    {TYPE_LABELS[task.type] || task.type}
                  </p>
                  <p className="task-desc">{task.description}</p>
                  <div className="task-meta">
                    <span className="reward">+ZMW {task.reward?.toFixed(2)}</span>
                    {task.vipOnly && <span className="badge badge-vip">VIP Only</span>}
                  </div>
                  <p style={{ fontSize: '0.78rem', color: '#6b7280', marginBottom: 10 }}>
                    Remaining: {remainingLabel} · Cooldown: {cooldownLabel}
                  </p>
                  {status.nextAvailableAt && (
                    <p style={{ fontSize: '0.78rem', color: '#ef4444', marginBottom: 10 }}>
                      Next available: {new Date(status.nextAvailableAt).toLocaleString()}
                    </p>
                  )}

                  {msg && (
                    <p className={msg.type === 'success' ? 'success-msg' : 'error-msg'} style={{ marginBottom: 8 }}>
                      {msg.text}
                    </p>
                  )}

                  <button
                    className="btn-success"
                    style={{ width: '100%' }}
                    onClick={() => completeTask(task._id)}
                    disabled={isDisabled}
                  >
                    {completing[task._id] ? <span className="spinner" /> : buttonLabel}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
