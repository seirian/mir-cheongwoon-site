import { MapPin, MonitorPlay } from 'lucide-react';
import PageHero from '../components/PageHero';
import { performanceHistory } from '../data/siteData';

export default function HistoryPage() {
  return (
    <>
      <PageHero eyebrow="PERFORMANCE HISTORY" title="함께 만든 무대의 기록" description="온라인과 오프라인에서 함께한 공연을 연도 흐름에 따라 확인할 수 있습니다." />
      <section className="section-wrap timeline">
        {performanceHistory.map((group) => (
          <div className="timeline-year" key={group.year}>
            <div className="year-sticky"><strong>{group.year}</strong><span>YEAR</span></div>
            <div className="year-events">
              {group.events.map((event, idx) => (
                <article className="timeline-event" key={`${event.date}-${idx}`}>
                  <div className="timeline-dot" />
                  <div className="event-meta"><span>{event.date}</span><span className={`event-type ${event.type.toLowerCase()}`}>{event.type === 'ONLINE' ? <MonitorPlay size={14}/> : <MapPin size={14}/>} {event.type}</span></div>
                  <h3>{event.title}</h3><p>{event.description}</p>
                </article>
              ))}
            </div>
          </div>
        ))}
      </section>
    </>
  );
}
