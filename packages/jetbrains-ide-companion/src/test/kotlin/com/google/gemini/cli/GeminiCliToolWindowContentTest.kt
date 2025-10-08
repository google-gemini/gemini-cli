package com.google.gemini.cli

import org.junit.Test
import kotlin.test.assertNotNull

class GeminiCliToolWindowContentTest {
    @Test
    fun `test tool window content panel is created`() {
        val toolWindowContent = GeminiCliToolWindowContent()
        assertNotNull(toolWindowContent.contentPanel)
    }
}