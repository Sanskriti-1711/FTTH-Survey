// Augment lucide-react-native's LucideProps to accept commonly-used SVG
// presentation attributes that the strict v1 types don't yet expose.
import 'lucide-react-native';

declare module 'lucide-react-native' {
  interface LucideProps {
    color?: import('react-native').ColorValue | string;
    stroke?: import('react-native').ColorValue | string;
    fill?: import('react-native').ColorValue | string;
  }
}
