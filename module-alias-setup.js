const moduleAlias = require('module-alias');
const path = require('path');

// Register path aliases for production
moduleAlias.addAliases({
  '@': path.join(__dirname, 'dist'),
  '@/controllers': path.join(__dirname, 'dist/controllers'),
  '@/middleware': path.join(__dirname, 'dist/middleware'), 
  '@/services': path.join(__dirname, 'dist/services'),
  '@/types': path.join(__dirname, 'dist/types'),
  '@/routes': path.join(__dirname, 'dist/routes'),
  '@/utils': path.join(__dirname, 'dist/utils')
});