import type { SettingsPageProps } from '../dashboard.types';
import ClubMembershipSection from './ClubMembershipSection';

const SettingsPage = ({
    username,
    error,
    message,
    busy,
    currentPassword,
    newPassword,
    confirmNewPassword,
    deletePassword,
    deleteConfirmation,
    setCurrentPassword,
    setNewPassword,
    setConfirmNewPassword,
    setDeletePassword,
    setDeleteConfirmation,
    onPasswordChange,
    onExport,
    onDelete
}: SettingsPageProps) => (
    <section>
        <h3>Settings</h3>
        {error && <div className="error-banner" role="alert">{error}</div>}
        {message && <div className="account-success" role="status">{message}</div>}
        <div className="settings-card account-settings">
            <div className="settings-intro">
                <span className="section-kicker">ACCOUNT SECURITY</span>
                <h4>Protect your account</h4>
                <p>Update your credentials, keep a copy of your data, or remove your account.</p>
            </div>
            <form className="account-form" onSubmit={onPasswordChange}>
                <h5>Change password</h5>
                <label>Current password
                    <input type="password" autoComplete="current-password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
                </label>
                <div className="account-form-grid">
                    <label>New password
                        <input type="password" autoComplete="new-password" minLength={8} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
                    </label>
                    <label>Confirm new password
                        <input type="password" autoComplete="new-password" minLength={8} required value={confirmNewPassword} onChange={(event) => setConfirmNewPassword(event.target.value)} />
                    </label>
                </div>
                <button className="btn-primary" type="submit" disabled={busy}>Update password</button>
            </form>
            <section className="account-export">
                <div>
                    <h5>Export account data in JSON format</h5>
                    <p>Download your profile details, match history, and recorded lifetime points.</p>
                </div>
                <button className="btn-primary secondary" type="button" disabled={busy} onClick={onExport}>
                    {busy ? 'Please wait…' : 'Download my data'}
                </button>
            </section>
            <form className="account-form danger-zone" onSubmit={onDelete}>
                <h5>Delete account</h5>
                <p>Past sessions and match results will be preserved under your username, which cannot be reused.</p>
                <label>Current password
                    <input type="password" autoComplete="current-password" required value={deletePassword} onChange={(event) => setDeletePassword(event.target.value)} />
                </label>
                <label>Type <strong>{username}</strong> to confirm
                    <input type="text" autoComplete="off" required value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} />
                </label>
                <button className="btn-danger" type="submit" disabled={busy}>Delete my account</button>
            </form>
            <ClubMembershipSection />
        </div>
    </section>
);

export default SettingsPage;
