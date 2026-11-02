import type { AchievementsPageProps } from '../dashboard.types';

const AchievementsPage = ({ achievements }: AchievementsPageProps) => {
    const groups = [
        { title: 'Unlocked', items: achievements.filter((item) => item.unlocked) },
        { title: 'Locked', items: achievements.filter((item) => !item.unlocked) }
    ];

    return (
        <section className="achievements-view">
            <div className="section-heading">
                <span className="section-kicker">CAREER MILESTONES</span>
                <h3>Achievements</h3>
                <p>Earned through completed matches and recorded match scores.</p>
            </div>
            <div className="achievement-sections">
                {groups.map((group) => (
                    <section className="achievement-group" key={group.title}>
                        <div className="achievement-group-heading">
                            <h4>{group.title}</h4>
                            <span>{group.items.length}</span>
                        </div>
                        {group.items.length ? (
                            <div className="achievement-grid">
                                {group.items.map((item) => (
                                    <article className={`achievement-card${item.unlocked ? ' is-unlocked' : ''}`} key={item.id}>
                                        <span className="achievement-state">{item.unlocked ? 'UNLOCKED' : 'IN PROGRESS'}</span>
                                        <h5>{item.title}</h5>
                                        <p className="achievement-tagline">{item.tagline}</p>
                                        <p>{item.requirement}</p>
                                        {!item.unlocked && (
                                            <>
                                                <div className="achievement-progress" role="progressbar" aria-valuenow={item.displayProgress} aria-valuemin={0} aria-valuemax={item.target}>
                                                    <span style={{ width: `${(item.displayProgress / item.target) * 100}%` }} />
                                                </div>
                                                <small>{item.displayProgress.toLocaleString()} / {item.target.toLocaleString()}</small>
                                            </>
                                        )}
                                    </article>
                                ))}
                            </div>
                        ) : (
                            <p className="achievement-empty">{group.title === 'Unlocked' ? 'Your first milestone is waiting.' : 'All current milestones unlocked. Keep playing.'}</p>
                        )}
                    </section>
                ))}
            </div>
        </section>
    );
};

export default AchievementsPage;
