/** Read-only category badges; never reduce the song's labels to the active search filter. */
export default function SongCategories({song}) {
  const categories=Array.isArray(song?.categories)?song.categories:[];
  if(!categories.length)return null;
  return <div className="ck-tags ck-song-categories" role="list" aria-label={`${song.title} 카테고리`}>
    {categories.map((category,index)=><span role="listitem" key={`${index}-${category}`}>{category}</span>)}
  </div>;
}
