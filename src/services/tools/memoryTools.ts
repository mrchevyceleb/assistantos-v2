/**
 * Memory Tools - Handle user preference remembering
 *
 * This tool allows the AI to save user preferences directly to their custom instructions,
 * which persist across all conversations.
 */

import { useAppStore } from '../../stores/appStore'

/**
 * Execute a memory-related tool
 */
export async function executeMemoryTool(
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  if (name !== 'remember_preference') {
    throw new Error(`Unknown memory tool: ${name}`)
  }

  const preference = input.preference as string
  const category = (input.category as string) || 'general'

  if (!preference?.trim()) {
    throw new Error('Preference text is required')
  }

  // Get current custom instructions
  const currentInstructions = useAppStore.getState().customInstructions

  // Format the preference bullet point
  const formattedPref = `- ${preference.trim()}`

  // Check if there's already a "Remembered Preferences" section
  let updatedInstructions: string
  const sectionHeader = '### Remembered Preferences'

  if (currentInstructions.includes(sectionHeader)) {
    // Find the section and append to it
    // The section ends at the next ### or end of string
    const sectionStart = currentInstructions.indexOf(sectionHeader)
    const afterHeader = currentInstructions.substring(sectionStart + sectionHeader.length)

    // Find where the next section starts (or end of string)
    const nextSectionMatch = afterHeader.match(/\n###\s/)
    const insertPosition = nextSectionMatch
      ? sectionStart + sectionHeader.length + nextSectionMatch.index!
      : currentInstructions.length

    // Check if preference already exists (avoid duplicates)
    const existingSection = currentInstructions.substring(sectionStart, insertPosition)
    if (existingSection.includes(preference.trim())) {
      return `This preference is already saved: "${preference}"`
    }

    // Insert the new preference at the end of the section
    updatedInstructions =
      currentInstructions.substring(0, insertPosition).trimEnd() +
      '\n' + formattedPref +
      currentInstructions.substring(insertPosition)
  } else {
    // Create new section at the end
    const categoryLabels: Record<string, string> = {
      coding: 'Coding',
      communication: 'Communication',
      workflow: 'Workflow',
      general: 'General'
    }

    const categoryLabel = categoryLabels[category] || 'General'

    updatedInstructions = currentInstructions.trimEnd() + `

${sectionHeader}

**${categoryLabel}:**
${formattedPref}`
  }

  // Update the store
  useAppStore.getState().setCustomInstructions(updatedInstructions)

  return `Saved to your custom instructions: "${preference}"\n\nThis preference will be applied to all future conversations. You can edit or remove it in Settings > Custom Instructions.`
}
