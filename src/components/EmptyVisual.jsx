import { Image } from 'lucide-react';

export default function EmptyVisual({ label = '사진 영역', className = '' }) {
  return (
    <div className={`empty-visual ${className}`}>
      <Image size={34} />
      <span>{label}</span>
    </div>
  );
}
