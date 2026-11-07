import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

interface JoinResponse {
    message?: string;
    sessionTitle?: string;
    clubName?: string;
    status?: 'scheduled' | 'active';
    error?: string;
}

const API_URL = import.meta.env.VITE_BACKEND_URL;

const JoinSession = ({ onSessionExpired }: { onSessionExpired: () => void }) => {
    const { sessionId } = useParams();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const started = useRef(false);
    const [loading, setLoading] = useState(true);
    const [result, setResult] = useState<JoinResponse | null>(null);
    const [error, setError] = useState('');
    const code = searchParams.get('code');
    const invalidLink = !sessionId || !code;

    useEffect(() => {
        if (started.current) return;
        started.current = true;
        if (!sessionId || !code) {
            return;
        }

        const join = async () => {
            try {
                const token = localStorage.getItem('token');
                if (!token) {
                    navigate(`/auth?next=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`, { replace: true });
                    return;
                }
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
                    navigate(`/auth?next=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`, { replace: true });
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
    }, [code, navigate, onSessionExpired, searchParams, sessionId]);

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
                ) : error ? (
                    <>
                        <h1>Could not join</h1>
                        <p role="alert">{error}</p>
                    </>
                ) : (
                    <>
                        <h1>{result?.message === 'You are already on this session roster' ? 'You’re already on the roster' : 'You’re on the roster'}</h1>
                        <p><strong>{result?.sessionTitle}</strong> · {result?.clubName}</p>
                        <p>{result?.status === 'active'
                            ? 'You’ve been added to the live session queue.'
                            : 'You’ve been added to the upcoming session.'}
                        </p>
                    </>
                )}
                {(!loading || invalidLink) && (
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
                .session-join-button { margin-top: 12px; padding: 12px 16px; border: 1px solid #c8f169; border-radius: 6px; color: #101914; background: #c8f169; font: inherit; font-weight: 800; cursor: pointer; }
            `}</style>
        </main>
    );
};

export default JoinSession;
