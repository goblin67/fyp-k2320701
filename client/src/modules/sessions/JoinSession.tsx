import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';

interface JoinResponse {
    message?: string;
    sessionTitle?: string;
    clubName?: string;
    status?: 'scheduled' | 'active';
    isGuest?: boolean;
    error?: string;
}

const API_URL = import.meta.env.VITE_BACKEND_URL;

const JoinSession = ({ onSessionExpired }: { onSessionExpired: () => void }) => {
    const { sessionId } = useParams();
    const [searchParams] = useSearchParams();
    const location = useLocation();
    const navigate = useNavigate();
    const started = useRef(false);
    const code = searchParams.get('code');
    const [loading, setLoading] = useState(() => Boolean(localStorage.getItem('token') && sessionId && code));
    const [guestName, setGuestName] = useState('');
    const [guestFormOpen, setGuestFormOpen] = useState(false);
    const [guestSubmitting, setGuestSubmitting] = useState(false);
    const [result, setResult] = useState<JoinResponse | null>(null);
    const [error, setError] = useState('');
    const invalidLink = !sessionId || !code;
    const joinPath = `${location.pathname}${location.search}`;

    useEffect(() => {
        if (started.current) return;
        started.current = true;
        if (!sessionId || !code) return;

        const token = localStorage.getItem('token');
        if (!token) return;

        const join = async () => {
            try {
                const response = await fetch(`${API_URL}/api/session-join/${encodeURIComponent(sessionId)}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({ code })
                });
                const data = await response.json() as JoinResponse;
                if (response.status === 401) {
                    onSessionExpired();
                    navigate(`/auth?next=${encodeURIComponent(joinPath)}`, { replace: true });
                    return;
                }
                if (!response.ok) throw new Error(data.error ?? 'Could not join this session.');
                setResult(data);
            } catch (requestError) {
                setError(requestError instanceof Error ? requestError.message : 'Could not join this session.');
            } finally {
                setLoading(false);
            }
        };
        void join();
    }, [code, joinPath, navigate, onSessionExpired, sessionId]);

    const handleGuestJoin = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!sessionId || !code) return;
        setError('');
        setGuestSubmitting(true);
        try {
            const response = await fetch(`${API_URL}/api/session-join/${encodeURIComponent(sessionId)}/guest`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, username: guestName })
            });
            const data = await response.json() as JoinResponse;
            if (!response.ok) throw new Error(data.error ?? 'Could not join this session.');
            setResult(data);
        } catch (requestError) {
            setError(requestError instanceof Error ? requestError.message : 'Could not join this session.');
        } finally {
            setGuestSubmitting(false);
        }
    };

    const goToAuth = (mode: 'login' | 'register') => {
        navigate(`/auth?next=${encodeURIComponent(joinPath)}${mode === 'register' ? '&mode=register' : ''}`);
    };

    return (
        <main className="session-join-page">
            <section className="session-join-card">
                <span className="session-join-kicker">COURT SYNC · SESSION CHECK-IN</span>
                {invalidLink ? (
                    <>
                        <h1>Could not join</h1>
                        <p role="alert">This session QR link is incomplete.</p>
                    </>
                ) : loading ? (
                    <>
                        <h1>Joining session…</h1>
                        <p>Please wait while we add you to the session roster.</p>
                    </>
                ) : error && !guestFormOpen ? (
                    <>
                        <h1>Could not join</h1>
                        <p className="session-join-error" role="alert">{error}</p>
                    </>
                ) : result ? (
                    <>
                        <h1>You’re on the roster</h1>
                        <p><strong>{result.sessionTitle}</strong> · {result.clubName}</p>
                        <p>{result.status === 'active'
                            ? 'You’ve been added to the live session queue.'
                            : 'You’ve been added to the upcoming session.'}
                        </p>
                        {result.isGuest && <p className="session-join-note">You joined as a guest. Your place is saved on this session roster, but guest activity is not linked to an account.</p>}
                    </>
                ) : (
                    <>
                        <h1>Join this session</h1>
                        <p>Choose how you’d like to join. You can sign in, create an account, or join this session as a guest.</p>
                        {error && <p className="session-join-error" role="alert">{error}</p>}
                        {guestFormOpen ? (
                            <form className="session-guest-form" onSubmit={handleGuestJoin}>
                                <label htmlFor="guest-name">Name for the session</label>
                                <input
                                    id="guest-name"
                                    autoComplete="name"
                                    maxLength={40}
                                    required
                                    value={guestName}
                                    onChange={(event) => setGuestName([...event.target.value].slice(0, 40).join(''))}
                                    placeholder="Enter your name"
                                />
                                <button className="session-join-button" type="submit" disabled={guestSubmitting}>
                                    {guestSubmitting ? 'Joining…' : 'Join as guest'}
                                </button>
                                <button className="session-join-secondary" type="button" onClick={() => { setError(''); setGuestFormOpen(false); }}>
                                    Back to options
                                </button>
                            </form>
                        ) : (
                            <div className="session-join-options">
                                <button className="session-join-button" type="button" onClick={() => goToAuth('login')}>Sign in to your account</button>
                                <button className="session-join-secondary" type="button" onClick={() => goToAuth('register')}>Create an account</button>
                                <button className="session-join-secondary" type="button" onClick={() => setGuestFormOpen(true)}>Continue as a guest</button>
                            </div>
                        )}
                    </>
                )}
                {result && !result.isGuest && (
                    <button className="session-join-button" type="button" onClick={() => navigate('/')}>
                        Go to CourtSync
                    </button>
                )}
            </section>
            <style>{`
                .session-join-page { min-height: 100vh; display: grid; place-items: center; padding: 24px; color: #eef5f5; background: #080d11; font-family: Inter, 'Segoe UI', sans-serif; }
                .session-join-card { width: min(500px, 100%); padding: 32px; border: 1px solid rgba(190,215,222,.18); border-radius: 12px; background: #0f171c; box-shadow: 0 24px 70px rgba(0,0,0,.4); }
                .session-join-kicker { color: #75c4f4; font-size: .72rem; font-weight: 800; letter-spacing: .14em; }
                .session-join-card h1 { margin: 14px 0 10px; }
                .session-join-card p { color: #aab9bd; line-height: 1.55; }
                .session-join-options, .session-guest-form { display: grid; gap: 12px; margin-top: 22px; }
                .session-guest-form label { color: #dce8e8; font-weight: 700; }
                .session-guest-form input { width: 100%; padding: 13px 15px; border: 1px solid rgba(190,215,222,.2); border-radius: 7px; color: #eef5f5; background: #080d11; font: inherit; }
                .session-join-button, .session-join-secondary { width: 100%; padding: 12px 16px; border: 1px solid #c8f169; border-radius: 6px; color: #101914; background: #c8f169; font: inherit; font-weight: 800; cursor: pointer; }
                .session-join-secondary { border-color: rgba(190,215,222,.22); color: #eef5f5; background: #172229; }
                .session-join-button:disabled { opacity: .65; cursor: wait; }
                .session-join-error { color: #ffaaa7 !important; }
                .session-join-note { padding: 12px; border: 1px solid rgba(117,196,244,.25); border-radius: 7px; background: rgba(117,196,244,.07); }
            `}</style>
        </main>
    );
};

export default JoinSession;
