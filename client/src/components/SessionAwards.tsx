import { memo } from 'react';

interface Award {
  id: string;
  icon: string;
  title: string;
  description: string;
  playerId: string;
  playerName: string;
  partnerName?: string;
  value: string;
}

interface SessionAwardsProps {
  awards: Award[];
}

const SessionAwards = memo(function SessionAwards({ awards }: SessionAwardsProps) {
  if (awards.length === 0) return null;

  return (
    <section className="session-awards" aria-label="Session Awards">
      <h3 className="session-awards__title">Awards</h3>
      <div className="session-awards__grid">
        {awards.map((award) => (
          <div key={award.id} className="session-awards__card">
            <span className="session-awards__icon">{award.icon}</span>
            <div className="session-awards__info">
              <span className="session-awards__award-title">{award.title}</span>
              <span className="session-awards__player">
                {award.partnerName
                  ? `${award.playerName} & ${award.partnerName}`
                  : award.playerName}
              </span>
              <span className="session-awards__value">{award.value}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
});

export default SessionAwards;
