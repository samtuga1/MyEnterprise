import { Link } from 'react-router';
import { Compass } from 'lucide-react';
import { EmptyState, useTitle } from '../../shared/ui/index.jsx';

export default function NotFound() {
  useTitle('Page not found');
  return (
    <div className="wrap page-pad">
      <EmptyState icon={<Compass />} title="This page does not exist"
        action={<div className="btn-row"><Link to="/" className="btn btn--primary">Go to the home page</Link><Link to="/shop" className="btn btn--secondary">Shop everything</Link></div>}>
        The link may be old, or the piece may have sold out for the season.
      </EmptyState>
    </div>
  );
}
