export default function PageHero({ eyebrow, title, description, className = '' }) {
  return (
    <section className={`page-hero section-wrap${className ? ` ${className}` : ''}`}>
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      <p>{description}</p>
    </section>
  );
}
