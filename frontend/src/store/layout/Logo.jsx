import { Link } from 'react-router';
import markUrl from '../../shared/brand/mark.png';

/** The MyEnterprise mark: the violet "ME" circle (made by tools/brand/make-icons.php). */
export function Mark({ size = 30 }) {
  return <img src={markUrl} width={size} height={size} alt="" aria-hidden="true" className="mark" decoding="async" />;
}

export default function Logo() {
  return (
    <Link to="/" className="logo" aria-label="MyEnterprise home">
      <Mark />
      <span className="logo__word">MyEnterprise</span>
    </Link>
  );
}
