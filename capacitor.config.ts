import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.example.flowline', // Development placeholder: review before distribution.
  appName: 'Flowline',
  webDir: 'dist',
  backgroundColor: '#F7F4ED',
  plugins: {
    SystemBars: {
      insetsHandling: 'native',
      initialViewportFitValueHint: 'cover',
      style: 'LIGHT',
    },
  },
};

export default config;
