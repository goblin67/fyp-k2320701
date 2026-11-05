import { useEffect, useState, type FormEvent } from 'react';
import './club-membership.css';

interface PublicClub {
    id: string;
    name: string;
}

interface Membership {
    clubId: string;
    name: string;
    status: 'pending' | 'approved';
    requestedAt: string;
}

interface ApiError {
    error?: string;
}

const API_URL = import.meta.env.VITE_BACKEND_URL;

const ClubMembershipSection = () => {
    const [clubs, setClubs] = useState<PublicClub[]>([]);
    const [memberships, setMemberships] = useState<Membership[]>([]);
    const [clubId, setClubId] = useState('');
    const [inviteCode, setInviteCode] = useState('');
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);

    const loadData = async (): Promise<{ clubs: PublicClub[]; memberships: Membership[] }> => {
        const token = localStorage.getItem('token');
        if (!token) throw new Error('Please log in again to manage club memberships.');
        const [clubResponse, membershipResponse] = await Promise.all([
            fetch(`${API_URL}/api/clubs`),
            fetch(`${API_URL}/api/clubs/mine`, { headers: { Authorization: `Bearer ${token}` } })
        ]);
        const clubData = await clubResponse.json() as PublicClub[] | ApiError;
        const membershipData = await membershipResponse.json() as Membership[] | ApiError;
        if (!clubResponse.ok || !membershipResponse.ok || !Array.isArray(clubData) || !Array.isArray(membershipData)) {
            throw new Error(
                (!Array.isArray(clubData) ? clubData.error : undefined) ??
                (!Array.isArray(membershipData) ? membershipData.error : undefined) ??
                'Could not load club memberships.'
            );
        }
        return { clubs: clubData, memberships: membershipData };
    };

    useEffect(() => {
        let cancelled = false;
        void loadData()
            .then((data) => {
                if (!cancelled) {
                    setClubs(data.clubs);
                    setMemberships(data.memberships);
                }
            })
            .catch((loadError: unknown) => {
                if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Could not load club memberships.');
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const requestMembership = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError('');
        setMessage('');
        setBusy(true);
        try {
            const token = localStorage.getItem('token');
            if (!token) throw new Error('Please log in again to manage club memberships.');
            const response = await fetch(`${API_URL}/api/clubs/join`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ clubId, inviteCode })
            });
            const result = await response.json() as ApiError & { message?: string };
            if (!response.ok) throw new Error(result.error ?? 'Could not request club membership.');
            const data = await loadData();
            setClubs(data.clubs);
            setMemberships(data.memberships);
            setInviteCode('');
            setMessage(result.message ?? 'Membership request sent.');
        } catch (requestError) {
            setError(requestError instanceof Error ? requestError.message : 'Could not request club membership.');
        } finally {
            setBusy(false);
        }
    };

    const availableClubs = clubs.filter((club) => !memberships.some((membership) => membership.clubId === club.id));

    return (
        <section className="club-membership">
            <div className="club-membership-heading">
                <div>
                    <span className="club-membership-kicker">CLUB ACCESS</span>
                    <h4>Your clubs</h4>
                    <p>Request to join a club with the invite code shared by its organiser.</p>
                </div>
            </div>
            {error && <div className="club-membership-alert" role="alert">{error}</div>}
            {message && <div className="club-membership-success" role="status">{message}</div>}
            {memberships.length ? (
                <ul className="club-membership-list">
                    {memberships.map((membership) => (
                        <li key={membership.clubId}>
                            <strong>{membership.name}</strong>
                            <span className={`club-membership-status ${membership.status}`}>
                                {membership.status === 'approved' ? 'Member' : 'Awaiting approval'}
                            </span>
                        </li>
                    ))}
                </ul>
            ) : <p className="club-membership-empty">You have not joined any clubs yet.</p>}
            {!clubs.length && <p className="club-membership-empty">No clubs are available yet. You can request membership here once an organiser creates one.</p>}
            {availableClubs.length > 0 && (
                <form className="club-membership-form" onSubmit={requestMembership}>
                    <label>Choose a club
                        <select required value={clubId} onChange={(event) => setClubId(event.target.value)}>
                            <option value="">Select a club</option>
                            {availableClubs.map((club) => <option key={club.id} value={club.id}>{club.name}</option>)}
                        </select>
                    </label>
                    <label>Invite code
                        <input required autoComplete="off" value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} />
                    </label>
                    <button type="submit" disabled={busy || !clubId}>{busy ? 'Sending…' : 'Request to join'}</button>
                </form>
            )}
        </section>
    );
};

export default ClubMembershipSection;
