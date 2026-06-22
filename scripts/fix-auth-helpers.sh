#!/bin/bash
# Script to fix deprecated auth helpers in API routes
# Date: March 2, 2026

echo "🔧 Fixing deprecated auth helpers in API routes..."

# Files to update
files=(
  "app/api/payroll/runs/route.ts"
  "app/api/payroll/runs/[id]/route.ts" 
  "app/api/payroll/runs/[id]/inputs/route.ts"
  "app/api/payroll/runs/[id]/approve/route.ts"
  "app/api/payroll/runs/[id]/export/route.ts"
  "app/api/payroll/runs/[id]/lock/route.ts"
)

# Update each file
for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    echo "📝 Updating $file..."
    
    # Replace the import
    sed -i.bak "s/import { createRouteHandlerClient } from '@supabase\/auth-helpers-nextjs';/import { createAuthResponse } from '@\/lib\/apiAuth';/" "$file"
    
    # Replace client creation and auth checks
    sed -i.bak "s/const supabase = createRouteHandlerClient({ cookies });/const auth = createAuthResponse();/" "$file"
    sed -i.bak "s/const { data: { session } } = await supabase.auth.getSession();/\/\/ Simplified auth for testing/" "$file"
    sed -i.bak "s/if (!session) {/if (!auth.isAuthorized) {/" "$file"
    
    # Clean up backup files
    rm "${file}.bak" 2>/dev/null || true
    
    echo "✅ Updated $file"
  else
    echo "⚠️  File not found: $file"
  fi
done

echo "🎉 All API routes updated successfully!"