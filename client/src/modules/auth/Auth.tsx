import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

interface AuthFormData {
    username: string;
    password: string;
    age?: string;
    level?: string;
    clubId?: string;
    clubCode?: string;
}

interface PublicClub {
    id: string;
    name: string;
}

interface AuthResponse {
    token?: string;
    username?: string;
    role?: 'player' | 'organiser';
    organiserAccess?: boolean;
    error?: string;
}

interface AuthProps {
    onLoginSuccess?: (role: 'player' | 'organiser', organiserAccess: boolean) => void;
}

const getErrorMessage = (error: unknown): string => error instanceof Error ? error.message : 'Something went wrong';

const Auth = ({ onLoginSuccess }: AuthProps) => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const nextPath = searchParams.get('next');
    const sessionJoinPath = nextPath?.startsWith('/join/') ? nextPath : null;
    const [isLogin, setIsLogin] = useState(true);
    const [formData, setFormData] = useState<AuthFormData>({ username: '', password: '' });
    const [clubs, setClubs] = useState<PublicClub[]>([]);
    const [error, setError] = useState(() =>
        searchParams.get('sessionExpired') === '1'
            ? 'Your login needs to be renewed. Please sign in again to continue.'
            : ''
    );

    useEffect(() => {
        if (isLogin || sessionJoinPath) return;
        let cancelled = false;
        const loadClubs = async () => {
            try {
                const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/clubs`);
                if (!response.ok) throw new Error('Could not load clubs');
                const data = await response.json() as PublicClub[];
                if (!cancelled) setClubs(data);
            } catch (requestError) {
                if (!cancelled) setError(getErrorMessage(requestError));
            }
        };
        void loadClubs();
        return () => {
            cancelled = true;
        };
    }, [isLogin, sessionJoinPath]);

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
        const url = `${import.meta.env.VITE_BACKEND_URL}${endpoint}`;

        const payload = isLogin ? formData : {
            username: formData.username,
            password: formData.password,
            age: formData.age,
            level: formData.level || 'Beginner',
            ...(formData.clubId ? { clubId: formData.clubId, clubCode: formData.clubCode } : {})
        };

        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json() as AuthResponse;

            if (!res.ok) throw new Error(data.error ?? 'Something went wrong');

            if (isLogin) {
                if (!data.token || !data.username || !data.role) throw new Error('Invalid login response');
                localStorage.setItem('token', data.token);
                localStorage.setItem('username', data.username);
                localStorage.setItem('role', data.role);
                const organiserAccess = data.organiserAccess ?? data.role === 'organiser';
                localStorage.setItem('organiserAccess', String(organiserAccess));
                if (onLoginSuccess) onLoginSuccess(data.role, organiserAccess);
                navigate(sessionJoinPath ?? '/');
            } else {
                alert(`Account created! Please login.${formData.clubId ? ' Your club membership request will be pending until an organiser approves it.' : ''}`);
                setIsLogin(true);
                setFormData({ username: '', password: '', age: '', level: 'Beginner' });
            }
        } catch (err) {
            setError(getErrorMessage(err));
        }
    };

    return (
        <div className="auth-page">
            <style>{`
                .auth-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; position: relative; isolation: isolate; overflow: hidden; background: radial-gradient(ellipse at 85% 12%, rgba(98,215,223,.12), transparent 30rem), #080d11; padding: 24px; font-family: Inter, 'Segoe UI', sans-serif; }
                .auth-page::before { content: ''; position: absolute; z-index: -1; inset: -20%; opacity: .14; background: linear-gradient(90deg, transparent 49.8%, #a8c0c5 50%, transparent 50.2%), linear-gradient(0deg, transparent 49.8%, #a8c0c5 50%, transparent 50.2%), linear-gradient(90deg, transparent 24.9%, #a8c0c5 25%, transparent 25.1%, transparent 74.9%, #a8c0c5 75%, transparent 75.1%); transform: perspective(800px) rotate(-17deg) scale(1.25); }
                .auth-card { width: min(500px, 100%); background: rgba(15, 23, 28, .96); border: 1px solid rgba(190,215,222,.16); border-radius: 14px; box-shadow: 0 28px 90px rgba(0,0,0,.48); overflow: hidden; backdrop-filter: blur(16px); }
                .auth-header { position: relative; overflow: hidden; background: linear-gradient(115deg, #c8f169, #62d7df); padding: 30px 30px 27px; color: #101914; }
                .auth-header::after { content: ''; position: absolute; width: 190px; height: 190px; right: -52px; top: -86px; border: 1px solid rgba(11,25,24,.25); border-radius: 50%; box-shadow: 0 0 0 14px rgba(11,25,24,.06), 0 0 0 36px rgba(11,25,24,.05); }
                .auth-header h1 { position: relative; z-index: 1; margin: 0; font-size: 2rem; letter-spacing: 0.1em; text-transform: uppercase; }
                .auth-header p { position: relative; z-index: 1; margin: 10px 0 0; color: rgba(16,25,20,.78); font-size: 0.95rem; }
                .auth-body { padding: 28px 30px 30px; display: grid; gap: 20px; }
                .auth-switch { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 5px; border: 1px solid rgba(190,215,222,.12); border-radius: 8px; background: #0a1115; }
                .auth-switch button { flex: 1; border: 1px solid transparent; border-radius: 9px; background: transparent; color: #9aabb2; cursor: pointer; font-weight: 700; }
                .auth-switch button.active { color: #101914; background: #c8f169; }
                .auth-form { display: grid; gap: 14px; }
                .auth-form input, .auth-form select { width: 100%; padding: 13px 15px; border-radius: 7px; border: 1px solid rgba(190,215,222,.16); background: #0b1216; color: #eef5f5; font-size: 0.95rem; }
                .auth-form input:focus, .auth-form select:focus { outline: 2px solid rgba(98,215,223,.6); outline-offset: 1px; border-color: #62d7df; }
                .auth-form input::placeholder, .auth-form select { color: #90a4aa; }
                .auth-form button { border: 1px solid #c8f169; border-radius: 7px; padding: 14px 16px; background: #c8f169; color: #101914; font-weight: 800; cursor: pointer; transition: transform 0.2s ease, box-shadow 0.2s ease; }
                .auth-form button:hover { transform: translateY(-1px); box-shadow: 0 8px 26px rgba(200,241,105,.2); }
                .auth-footer { color: #a7b7bb; font-size: 0.95rem; text-align: center; }
                .auth-footer span { color: #62d7df; cursor: pointer; font-weight: 700; }
                .auth-error { color: #ffaaa7; padding: 12px 16px; border-radius: 10px; background: rgba(255,109,105,.1); border: 1px solid rgba(255,109,105,.28); }
            `}</style>

            <div className="auth-card">
                <div className="auth-header">
                    <h1>COURT SYNC</h1>
                    <p>{sessionJoinPath
                        ? isLogin
                            ? 'Sign in to join the session you scanned.'
                            : 'Create your account, then sign in to join the session.'
                        : isLogin
                            ? 'Sign in to access your player portal and match dashboard.'
                            : 'Create your account to join sessions and track your progress.'}</p>
                </div>

                <div className="auth-body">
                    {error && <div className="auth-error">{error}</div>}

                    <div className="auth-switch">
                        <button className={isLogin ? 'active' : ''} onClick={() => { setError(''); setIsLogin(true); }}>Login</button>
                        <button className={!isLogin ? 'active' : ''} onClick={() => { setError(''); setIsLogin(false); }}>Register</button>
                    </div>

                    <form className="auth-form" onSubmit={handleSubmit}>
                        <input
                            type="text"
                            placeholder="Username"
                            required
                            value={formData.username}
                            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                        />
                        <input
                            type="password"
                            placeholder="Password"
                            required
                            value={formData.password}
                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        />
                        {!isLogin && (
                            <>
                                <input
                                    type="number"
                                    placeholder="Age"
                                    value={formData.age || ''}
                                    onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                                />
                                <select
                                    value={formData.level || 'Beginner'}
                                    onChange={(e) => setFormData({ ...formData, level: e.target.value })}
                                >
                                    <option value="Beginner">Beginner</option>
                                    <option value="Weekly casual">Weekly casual</option>
                                    <option value="Tier 1/2/3 BE">Tier 1/2/3 BE</option>
                                    <option value="Bi-weekly casual">Bi-weekly casual</option>
                                    <option value="Occasional tournament player">Occasional tournament player</option>
                                    <option value="ISO medal holder">ISO medal holder</option>
                                    <option value="Badminton England rated">Badminton England rated</option>
                                </select>
                                {!sessionJoinPath && (
                                    <select
                                        value={formData.clubId || ''}
                                        onChange={(e) => setFormData({ ...formData, clubId: e.target.value, clubCode: '' })}
                                    >
                                        <option value="">Join a club later (optional)</option>
                                        {clubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}
                                    </select>
                                )}
                                {!sessionJoinPath && formData.clubId && (
                                    <input
                                        type="text"
                                        placeholder="Club invite code"
                                        autoComplete="off"
                                        required
                                        value={formData.clubCode || ''}
                                        onChange={(e) => setFormData({ ...formData, clubCode: e.target.value })}
                                    />
                                )}
                            </>
                        )}
                        <button type="submit">{isLogin ? 'Login' : 'Create Account'}</button>
                    </form>

                    <div className="auth-footer">
                        {isLogin ? (
                            <span onClick={() => setIsLogin(false)}>Need an account? Register</span>
                        ) : (
                            <span onClick={() => setIsLogin(true)}>Have an account? Login</span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Auth;