
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "friendships": {
                  Row: {
                    "addressee_id": string,"created_at": string,"id": string,"requester_id": string,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "addressee_id": string,"created_at"?: string,"id"?: string,"requester_id": string,"status"?: string
                  }
                  Update: {
                    "addressee_id"?: string,"created_at"?: string,"id"?: string,"requester_id"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "friendships_addressee_id_fkey"
      columns: ["addressee_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "friendships_requester_id_fkey"
      columns: ["requester_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"gifts": {
                  Row: {
                    "created_at": string,"created_recipe_id": string | null,"from_user_id": string,"id": string,"message": string | null,"recipe_id": string,"status": string,"to_user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_recipe_id"?: string | null,"from_user_id": string,"id"?: string,"message"?: string | null,"recipe_id": string,"status"?: string,"to_user_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_recipe_id"?: string | null,"from_user_id"?: string,"id"?: string,"message"?: string | null,"recipe_id"?: string,"status"?: string,"to_user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "gifts_created_recipe_id_fkey"
      columns: ["created_recipe_id"]
isOneToOne: false
      referencedRelation: "recipes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "gifts_from_user_id_fkey"
      columns: ["from_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "gifts_recipe_id_fkey"
      columns: ["recipe_id"]
isOneToOne: false
      referencedRelation: "recipes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "gifts_to_user_id_fkey"
      columns: ["to_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"labels": {
                  Row: {
                    "color": string,"created_at": string,"id": string,"name": string,"owner_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "color"?: string,"created_at"?: string,"id"?: string,"name": string,"owner_id"?: string
                  }
                  Update: {
                    "color"?: string,"created_at"?: string,"id"?: string,"name"?: string,"owner_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "labels_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"display_name": string | null,"email": string,"id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"display_name"?: string | null,"email": string,"id": string
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string | null,"email"?: string,"id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"recipe_ingredients": {
                  Row: {
                    "id": string,"is_heading": boolean,"item": string,"position": number,"recipe_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"is_heading"?: boolean,"item": string,"position"?: number,"recipe_id": string
                  }
                  Update: {
                    "id"?: string,"is_heading"?: boolean,"item"?: string,"position"?: number,"recipe_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipe_ingredients_recipe_id_fkey"
      columns: ["recipe_id"]
isOneToOne: false
      referencedRelation: "recipes"
      referencedColumns: ["id"]
    }
                  ]
                },"recipe_labels": {
                  Row: {
                    "label_id": string,"recipe_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "label_id": string,"recipe_id": string
                  }
                  Update: {
                    "label_id"?: string,"recipe_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipe_labels_label_id_fkey"
      columns: ["label_id"]
isOneToOne: false
      referencedRelation: "labels"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recipe_labels_recipe_id_fkey"
      columns: ["recipe_id"]
isOneToOne: false
      referencedRelation: "recipes"
      referencedColumns: ["id"]
    }
                  ]
                },"recipe_steps": {
                  Row: {
                    "body": string,"id": string,"is_heading": boolean,"position": number,"recipe_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"id"?: string,"is_heading"?: boolean,"position"?: number,"recipe_id": string
                  }
                  Update: {
                    "body"?: string,"id"?: string,"is_heading"?: boolean,"position"?: number,"recipe_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipe_steps_recipe_id_fkey"
      columns: ["recipe_id"]
isOneToOne: false
      referencedRelation: "recipes"
      referencedColumns: ["id"]
    }
                  ]
                },"recipes": {
                  Row: {
                    "category": string | null,"cook_minutes": number | null,"created_at": string,"cuisine": string | null,"description": string | null,"gifted_from_recipe_id": string | null,"gifted_from_user_id": string | null,"id": string,"image_path": string | null,"notes": string | null,"owner_id": string,"prep_minutes": number | null,"servings": number | null,"source_name": string | null,"source_url": string | null,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category"?: string | null,"cook_minutes"?: number | null,"created_at"?: string,"cuisine"?: string | null,"description"?: string | null,"gifted_from_recipe_id"?: string | null,"gifted_from_user_id"?: string | null,"id"?: string,"image_path"?: string | null,"notes"?: string | null,"owner_id"?: string,"prep_minutes"?: number | null,"servings"?: number | null,"source_name"?: string | null,"source_url"?: string | null,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "category"?: string | null,"cook_minutes"?: number | null,"created_at"?: string,"cuisine"?: string | null,"description"?: string | null,"gifted_from_recipe_id"?: string | null,"gifted_from_user_id"?: string | null,"id"?: string,"image_path"?: string | null,"notes"?: string | null,"owner_id"?: string,"prep_minutes"?: number | null,"servings"?: number | null,"source_name"?: string | null,"source_url"?: string | null,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "recipes_gifted_from_recipe_fk"
      columns: ["gifted_from_recipe_id"]
isOneToOne: false
      referencedRelation: "recipes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recipes_gifted_from_user_id_fkey"
      columns: ["gifted_from_user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "recipes_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "are_friends":
{ Args: { "p_other": string }; Returns: boolean
                           },
"can_see_profile":
{ Args: { "p_user_id": string }; Returns: boolean
                           },
"can_view_recipe":
{ Args: { "p_recipe_id": string }; Returns: boolean
                           },
"clone_recipe":
{ Args: { "p_from_user": string,"p_new_owner": string,"p_recipe_id": string }; Returns: string
                           },
"gift_recipe":
{ Args: { "p_message"?: string,"p_recipe_id": string,"p_to_user_id": string }; Returns: string
                           },
"is_recipe_owner":
{ Args: { "p_recipe_id": string }; Returns: boolean
                           },
"request_friend":
{ Args: { "p_email": string }; Returns: string
                           },
"respond_friend":
{ Args: { "p_accept": boolean,"p_friendship_id": string }; Returns: undefined
                           },
"respond_gift":
{ Args: { "p_accept": boolean,"p_gift_id": string }; Returns: string
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
