const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://qoxsgxawrvulprapmjiu.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFveHNneGF3cnZ1bHByYXBtaml1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDExNTkzOTQsImV4cCI6MjA1NjczNTM5NH0.eVXhFUv9ob6AiDwyOW4t5pPuYjFCfZvhn21Cmu-43qI'
);

(async () => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'lrojas@dttcoaching.com', // Cambia por el email que quieras probar
    password: 'Adios2822' // Cambia por la contraseña real
  });
  console.log('DATA:', data);
  console.log('ERROR:', error);
})();
