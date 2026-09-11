export default function PageHero({ eyebrow, title, description }) {
  return (
    <section className="page-hero section-wrap">
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      <p>{description}</p>
    </section>
  );
}
