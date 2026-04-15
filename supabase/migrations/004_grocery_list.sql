-- Migration 004: Grocery list items tracking
CREATE TABLE IF NOT EXISTS public.grocery_list_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    amount TEXT,
    unit TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS
ALTER TABLE public.grocery_list_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own grocery list items" 
    ON public.grocery_list_items FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own grocery list items" 
    ON public.grocery_list_items FOR SELECT 
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own grocery list items" 
    ON public.grocery_list_items FOR UPDATE 
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own grocery list items" 
    ON public.grocery_list_items FOR DELETE 
    USING (auth.uid() = user_id);
