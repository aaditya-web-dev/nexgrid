import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Eye, EyeOff, Lock, Mail, MessageSquare, ShieldCheck, User, UserPen, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ErrorAlert, Logo } from '../components/common/UIComponents';

const FEATURES = [
  [Users, 'Real-time collaboration', 'See who is online and edit with request locks.'],
  [MessageSquare, 'Comments on every request', 'Discuss changes right next to the endpoint.'],
  [ShieldCheck, 'Role-based access', 'Owner, editor and viewer roles per workspace.'],
];

const list = { hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.12 } } };
const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: 'easeOut' } } };

const AuthShell = ({ title, subtitle, children, footer, shake = 0 }) => (
  <div className="min-h-screen bg-slate-950 grid lg:grid-cols-[1.1fr_1fr]">
    <aside className="hidden lg:flex flex-col justify-between p-12 border-r border-slate-800 relative overflow-hidden bg-[radial-gradient(rgb(148_163_184/0.14)_1px,transparent_1px)] bg-[size:22px_22px]">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,transparent_0%,#020617_75%)] pointer-events-none" />
      <div className="relative"><Logo size={36} animated /></div>
      <motion.div variants={list} initial="hidden" animate="show" className="relative max-w-md space-y-8">
        <motion.h2 variants={item} className="text-3xl font-semibold tracking-tight text-slate-50 leading-tight">
          Test APIs together, in one shared workspace.
        </motion.h2>
        <ul className="space-y-5">
          {FEATURES.map(([Icon, head, text]) => (
            <motion.li key={head} variants={item} className="flex gap-3">
              <span className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center shrink-0">
                <Icon className="w-4 h-4 text-sky-300" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-sm font-medium text-slate-100">{head}</span>
                <span className="block text-xs text-slate-400 mt-0.5">{text}</span>
              </span>
            </motion.li>
          ))}
        </ul>
      </motion.div>
      <p className="relative text-[11px] text-slate-600">Collaborative API testing platform</p>
    </aside>

    <main className="flex flex-col justify-center items-center p-6">
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: 'easeOut' }} className="w-full max-w-sm">
        <div className="lg:hidden mb-6"><Logo size={34} animated /></div>
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-50 tracking-tight">{title}</h1>
          <p className="text-sm text-slate-400 mt-1">{subtitle}</p>
        </div>
        <motion.div
          key={shake}
          animate={shake ? { x: [0, -8, 8, -5, 5, 0] } : {}}
          transition={{ duration: 0.35 }}
          className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-2xl shadow-black/40"
        >
          {children}
        </motion.div>
        <div className="mt-6 text-center text-sm text-slate-400">{footer}</div>
      </motion.div>
    </main>
  </div>
);

const InputField = ({ label, icon: Icon, type = 'text', children, ...props }) => {
  const [show, setShow] = useState(false);
  const isPw = type === 'password';
  return (
    <motion.div variants={item} className="space-y-1.5">
      <label className="block text-xs font-medium text-slate-300">{label}</label>
      <div className="group relative">
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-sky-300 transition-colors pointer-events-none" aria-hidden="true" />
        <input
          {...props}
          type={isPw && show ? 'text' : type}
          className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-9 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 hover:border-slate-600 focus:outline-none focus:border-sky-400/70 focus:ring-2 focus:ring-sky-400/20 transition"
        />
        {isPw && (
          <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-200 cursor-pointer">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={show ? 'off' : 'on'} initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.7 }} transition={{ duration: 0.1 }} className="flex">
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </motion.span>
            </AnimatePresence>
          </button>
        )}
      </div>
      {children}
    </motion.div>
  );
};

const STRENGTH = [['', ''], ['Weak', 'bg-rose-400'], ['Fair', 'bg-amber-400'], ['Good', 'bg-sky-400'], ['Strong', 'bg-emerald-400']];
const scorePassword = (p) =>
  [p.length >= 8, /[a-z]/.test(p) && /[A-Z]/.test(p), /\d/.test(p), /[^A-Za-z0-9]/.test(p)].filter(Boolean).length;

const StrengthMeter = ({ password }) => {
  const score = password ? scorePassword(password) : 0;
  if (!password) return null;
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 pt-0.5">
      <div className="flex flex-1 gap-1">
        {[1, 2, 3, 4].map((n) => (
          <span key={n} className={`h-1 flex-1 rounded-full transition-colors duration-200 ${n <= score ? STRENGTH[score][1] : 'bg-slate-800'}`} />
        ))}
      </div>
      <span className="text-[11px] text-slate-400 w-10 text-right">{STRENGTH[score][0]}</span>
    </motion.div>
  );
};

const SubmitButton = ({ loading, children }) => (
  <motion.button
    variants={item}
    type="submit"
    disabled={loading}
    whileHover={{ scale: 1.01 }}
    whileTap={{ scale: 0.98 }}
    className="group w-full py-2.5 px-4 bg-sky-500 hover:bg-sky-400 disabled:opacity-60 disabled:cursor-not-allowed text-slate-950 rounded-lg text-sm font-semibold transition-colors cursor-pointer flex justify-center items-center gap-2 shadow-lg shadow-sky-500/20"
  >
    {loading ? <span className="w-3.5 h-3.5 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" /> : null}
    {children}
    {!loading && <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />}
  </motion.button>
);

export const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(username, password);
      navigate('/');
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(
        typeof detail === 'string'
          ? detail
          : 'Invalid username or password. Please try again.'
      );
      setShake((n) => n + 1);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      shake={shake}
      title="Sign in to Nexgrid"
      subtitle="Collaborative API testing for your team"
      footer={
        <>
          New to Nexgrid?{' '}
          <Link to="/register" className="text-sky-300 hover:text-sky-200 font-medium transition-colors">
            Create an account
          </Link>
        </>
      }
    >
      <ErrorAlert message={error} onDismiss={() => setError('')} />

      <motion.form variants={list} initial="hidden" animate="show" onSubmit={handleSubmit} className="space-y-4">
        <InputField label="Username" icon={User} type="text"
            required
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter your username"
          />

        <InputField label="Password" icon={Lock} type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
          />

        <SubmitButton loading={loading}>{loading ? 'Signing in...' : 'Sign in'}</SubmitButton>
      </motion.form>
    </AuthShell>
  );
};

export const Register = () => {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    username: '',
    email: '',
    full_name: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(0);

  const handleChange = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await register(formData);
      navigate('/');
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(
        typeof detail === 'string'
          ? detail
          : Array.isArray(detail)
          ? detail.map((d) => d.msg).join(', ')
          : 'Registration failed. Check details and try again.'
      );
      setShake((n) => n + 1);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      shake={shake}
      title="Create your account"
      subtitle="Start collaborating with your team"
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="text-sky-300 hover:text-sky-200 font-medium transition-colors">
            Sign in
          </Link>
        </>
      }
    >
      <ErrorAlert message={error} onDismiss={() => setError('')} />

      <motion.form variants={list} initial="hidden" animate="show" onSubmit={handleSubmit} className="space-y-4">
        <InputField label="Username" icon={User} type="text"
            name="username"
            required
            minLength={3}
            maxLength={50}
            autoComplete="username"
            value={formData.username}
            onChange={handleChange}
            placeholder="At least 3 characters"
          />

        <InputField label="Email" icon={Mail} type="email"
            name="email"
            required
            autoComplete="email"
            value={formData.email}
            onChange={handleChange}
            placeholder="you@company.com"
          />

        <InputField label="Full name (optional)" icon={UserPen} type="text"
            name="full_name"
            autoComplete="name"
            value={formData.full_name}
            onChange={handleChange}
            placeholder="Your name"
          />

        <InputField label="Password" icon={Lock} type="password"
            name="password"
            required
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
            value={formData.password}
            onChange={handleChange}
            placeholder="At least 8 characters"
          >
          <StrengthMeter password={formData.password} />
        </InputField>

        <SubmitButton loading={loading}>{loading ? 'Creating account...' : 'Create account'}</SubmitButton>
      </motion.form>
    </AuthShell>
  );
};
