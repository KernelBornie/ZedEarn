import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import api from '../api/axios';

export default function VerifyOTP() {
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({
    email: location.state?.email || '',
    otp: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await api.post('/auth/verify-reset-otp', {
        email: form.email,
        otp: form.otp,
      });
      const resetToken = res.data?.resetToken;
      if (!resetToken) {
        setError('Unable to verify OTP. Please try again.');
        return;
      }
      sessionStorage.setItem('ze_reset_token', resetToken);
      navigate('/reset-password');
    } catch (err) {
      const apiErrors = err.response?.data?.errors;
      if (apiErrors?.length) {
        setError(apiErrors.map((error) => error.msg).join(', '));
      } else {
        setError(err.response?.data?.message || 'OTP verification failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>ZedEarn</h1>
        <p className="subtitle">Enter the 6-digit code sent to your email.</p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              name="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={handleChange}
              required
            />
          </div>
          <div className="form-group">
            <label>OTP Code</label>
            <input
              type="text"
              name="otp"
              placeholder="123456"
              value={form.otp}
              onChange={handleChange}
              required
            />
          </div>

          {error && <p className="error-msg">{error}</p>}

          <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: 8 }} disabled={loading}>
            {loading ? <span className="spinner" /> : 'Verify OTP'}
          </button>
        </form>

        <p className="auth-link">
          Need a new code? <Link to="/forgot-password">Resend OTP</Link>
        </p>
      </div>
    </div>
  );
}
