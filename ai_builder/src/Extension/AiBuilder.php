<?php
/**
 * @package     Joomla.Plugin
 * @subpackage  System.ai_builder
 *
 * @copyright   Copyright (C) 2025 AI Builder Team
 * @license     GNU General Public License version 2 or later
 */

namespace Joomla\Plugin\System\AiBuilder\Extension;

defined('_JEXEC') or die;

use Joomla\CMS\Factory;
use Joomla\CMS\Language\Text;
use Joomla\CMS\Plugin\CMSPlugin;
use Joomla\CMS\Response\JsonResponse;
use Joomla\CMS\User\UserHelper;
use Joomla\Event\DispatcherInterface;

/**
 * YOOtheme AI Builder System Plugin
 *
 * @since  1.0.0
 */
class AiBuilder extends CMSPlugin
{
    /**
     * Autoload the plugin language file
     *
     * @var    boolean
     * @since  1.0.0
     */
    protected $autoloadLanguage = true;

    /**
     * Application object
     *
     * @var    \Joomla\CMS\Application\CMSApplication
     * @since  1.0.0
     */
    protected $app;

    /**
     * Database object
     *
     * @var    \Joomla\Database\DatabaseDriver
     * @since  1.0.0
     */
    protected $db;

    /**
     * Constructor
     *
     * @param   DispatcherInterface  $dispatcher  The dispatcher
     * @param   array                $config      An optional associative array of configuration settings
     *
     * @since   1.0.0
     */
    public function __construct(DispatcherInterface $dispatcher, array $config)
    {
        parent::__construct($dispatcher, $config);

        $this->app = Factory::getApplication();
        $this->db = Factory::getDbo();
    }

    /**
     * Inject AI Builder UI into YOOtheme customizer
     *
     * @return  void
     *
     * @since   3.0.0
     */
    public function onBeforeCompileHead(): void
    {
        // Only run in administrator
        if (!$this->app->isClient('administrator')) {
            return;
        }

        // Only inject on YOOtheme customizer page
        $option = $this->app->input->get('option');
        $p = $this->app->input->get('p');

        if ($option !== 'com_ajax' || $p !== 'customizer') {
            return;
        }

        // Get the document
        $doc = $this->app->getDocument();

        if ($doc->getType() !== 'html') {
            return;
        }

        // Add script directly to document head (more reliable than WebAssetManager)
        $doc->addScript('/media/plg_system_ai_builder/js/custom-code-injector.js', [], ['defer' => true]);

        // Debug: confirm script injection
        if ($this->params->get('debug_mode', 0)) {
            $doc->addScriptDeclaration('console.log("[AI Builder Plugin] Script injection triggered");');
        }
    }

    /**
     * Handle AJAX requests
     *
     * @return  void
     *
     * @since   1.0.0
     */
    public function onAjaxAiBuilder(): void
    {
        // Security: Check user permissions
        if (!$this->checkUserPermissions()) {
            $this->sendJsonResponse(false, 'Unauthorized access', [], 403);
            return;
        }

        // Get the task from the request
        $input = $this->app->input;
        $task = $input->getString('task', 'process');

        try {
            switch ($task) {
                case 'getContext':
                    $result = $this->getSiteContext();
                    break;

                case 'getDefaultStyleId':
                    $result = $this->getDefaultStyleId();
                    break;

                case 'processLLM':
                    $result = $this->processLLMRequest();
                    break;

                case 'processVision':
                    $result = $this->processVisionRequest();
                    break;

                case 'process':
                default:
                    $result = $this->processRequest();
                    break;
            }

            $this->sendJsonResponse(true, 'Success', $result);

        } catch (\Exception $e) {
            $this->logError($e);
            $this->sendJsonResponse(false, $e->getMessage(), [], 500);
        }
    }

    /**
     * Main task: Process the user's natural language request
     *
     * @return  array  The processing result
     *
     * @since   1.0.0
     * @throws  \Exception
     */
    private function processRequest(): array
    {
        $input = $this->app->input;

        // Get data from the frontend request
        $prompt = $input->getString('prompt', '');
        $styleId = $input->getInt('styleId', 0);
        $currentContextJson = $input->getString('currentContext', '');

        if (empty($prompt)) {
            throw new \Exception('Missing prompt.');
        }

        if (empty($styleId)) {
            throw new \Exception('Missing template style ID.');
        }

        // Get current layout for context
        $mode = $input->getWord('mode', 'ui');
        $currentLayout = $this->getLayoutByStyleId($styleId);

        if ($mode === 'ui') {
            // Ask the AI to describe the UI actions we should take instead of mutating the DB
            $aiPlanJson = $this->callAiModel($prompt, $currentLayout, 'ui_plan');
            $planArray = json_decode($aiPlanJson, true);

            if (!is_array($planArray)) {
                throw new \Exception('AI returned an invalid UI automation plan.');
            }

            $normalizedPlan = $this->normalizeUiActionPlan($planArray, $prompt);

            return [
                'message' => 'Action plan generated successfully!',
                'actionPlan' => $normalizedPlan,
                'styleId' => $styleId
            ];
        }

        // Legacy/database mode fallback: generate JSON and persist directly
        $aiGeneratedJson = $this->callAiModel($prompt, $currentLayout);
        $success = $this->updateYooThemeLayout($styleId, $aiGeneratedJson);

        if (!$success) {
            throw new \Exception('Failed to update layout in database.');
        }

        return [
            'message' => 'Layout updated successfully!',
            'newElementJson' => $aiGeneratedJson,
            'styleId' => $styleId
        ];
    }

    /**
     * Task: Get the current YOOtheme layout context
     *
     * @return  array  The site context data
     *
     * @since   1.0.0
     * @throws  \Exception
     */
    private function getSiteContext(): array
    {
        $input = $this->app->input;
        $styleId = $input->getInt('styleId', 0);

        if (empty($styleId)) {
            throw new \Exception('Missing template style ID.');
        }

        $layout = $this->getLayoutByStyleId($styleId);

        return [
            'layout' => $layout,
            'styleId' => $styleId
        ];
    }

    /**
     * Get the default YOOtheme template style ID
     *
     * @return  array  The default style ID
     *
     * @since   1.0.0
     * @throws  \Exception
     */
    private function getDefaultStyleId(): array
    {
        // Get the default YOOtheme template style
        $query = $this->db->getQuery(true)
            ->select($this->db->quoteName(['id', 'template', 'title']))
            ->from($this->db->quoteName('#__template_styles'))
            ->where($this->db->quoteName('client_id') . ' = 0')
            ->where('(' . $this->db->quoteName('template') . ' LIKE ' . $this->db->quote('yootheme%') . ')')
            ->order($this->db->quoteName('home') . ' DESC, ' . $this->db->quoteName('id') . ' ASC');

        $this->db->setQuery($query, 0, 1);
        $style = $this->db->loadObject();

        if (!$style) {
            throw new \Exception('No YOOtheme template found. Please make sure YOOtheme Pro is installed and set as default template.');
        }

        return [
            'styleId' => (int) $style->id,
            'template' => $style->template,
            'title' => $style->title
        ];
    }

    /**
     * Get layout from database by style ID
     *
     * @param   int  $styleId  The template style ID
     *
     * @return  string  The layout JSON
     *
     * @since   1.0.0
     * @throws  \Exception
     */
    private function getLayoutByStyleId(int $styleId): string
    {
        $query = $this->db->getQuery(true)
            ->select($this->db->quoteName('params'))
            ->from($this->db->quoteName('#__template_styles'))
            ->where($this->db->quoteName('id') . ' = :styleid')
            ->bind(':styleid', $styleId, \Joomla\Database\ParameterType::INTEGER);

        $this->db->setQuery($query);
        $paramsStr = $this->db->loadResult();

        if (empty($paramsStr)) {
            throw new \Exception('Could not load template style.');
        }

        $paramsObj = json_decode($paramsStr);

        if ($paramsObj === null) {
            throw new \Exception('Invalid JSON in template params.');
        }

        return $paramsObj->builder ?? '{}';
    }

    /**
     * Call the AI model to generate YOOtheme element JSON
     *
     * @param   string  $prompt         The user's natural language prompt
     * @param   string  $currentLayout  The current layout JSON for context
     *
     * @return  string  The AI-generated element JSON
     *
     * @since   1.0.0
     * @throws  \Exception
     */
    private function callAiModel(string $prompt, string $currentLayout, string $mode = 'element'): string
    {
        $provider = $this->params->get('ai_provider', 'local');

        switch ($provider) {
            case 'google':
                return $this->callGoogleAI($prompt, $currentLayout, $mode);

            case 'xai':
                return $this->callXAI($prompt, $currentLayout, $mode);

            case 'local':
                return $this->callLocalModel($prompt, $currentLayout, $mode);

            default:
                throw new \Exception('Invalid AI provider configured: ' . $provider);
        }
    }


    /**
     * Call Google AI API
     *
     * @param   string  $prompt         The user's prompt
     * @param   string  $currentLayout  The current layout
     *
     * @return  string  The generated JSON
     *
     * @since   1.0.0
     * @throws  \Exception
     */
    private function callGoogleAI(string $prompt, string $currentLayout, string $mode = 'element'): string
    {
        $apiKey = $this->params->get('google_api_key', '');

        if (empty($apiKey)) {
            throw new \Exception('Google AI API key not configured.');
        }

        $model = $this->params->get('model_name', 'gemini-2.0-flash-exp');

        $systemPrompt = $this->getSystemPrompt($mode);

        $fullPrompt = $systemPrompt . "\n\nCurrent Layout:\n" . $currentLayout . "\n\nUser Request: " . $prompt;

        $data = [
            'contents' => [
                [
                    'parts' => [
                        ['text' => $fullPrompt]
                    ]
                ]
            ],
            'generationConfig' => [
                'temperature' => 0.7,
                'maxOutputTokens' => 2000
            ]
        ];

        // Correct Gemini API endpoint - API key goes in header, not URL
        $url = "https://generativelanguage.googleapis.com/v1beta/models/{$model}:generateContent";

        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'x-goog-api-key: ' . $apiKey
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

        if (curl_errno($ch)) {
            $error = curl_error($ch);
            curl_close($ch);
            throw new \Exception('Google AI API error: ' . $error);
        }

        curl_close($ch);

        if ($httpCode !== 200) {
            throw new \Exception('Google AI API returned HTTP ' . $httpCode . ': ' . $response);
        }

        $result = json_decode($response, true);

        if (!isset($result['candidates'][0]['content']['parts'][0]['text'])) {
            throw new \Exception('Invalid response from Google AI.');
        }

        return $this->extractJsonFromResponse($result['candidates'][0]['content']['parts'][0]['text']);
    }


    /**
     * Call xAI Grok API
     *
     * @param   string  $prompt         The user's prompt
     * @param   string  $currentLayout  The current layout
     * @param   string  $mode           Mode (element or ui_plan)
     *
     * @return  string  The generated JSON
     *
     * @since   3.0.0
     * @throws  \Exception
     */
    private function callXAI(string $prompt, string $currentLayout, string $mode = 'element'): string
    {
        $apiKey = $this->params->get('xai_api_key', '');

        if (empty($apiKey)) {
            throw new \Exception('xAI API key not configured. Get one at console.x.ai');
        }

        $model = $this->params->get('model_name', 'grok-2-1212');

        $systemPrompt = $this->getSystemPrompt($mode);

        $messages = [
            ['role' => 'system', 'content' => $systemPrompt],
            ['role' => 'user', 'content' => "Current Layout:\n" . $currentLayout],
            ['role' => 'user', 'content' => "User Request: " . $prompt]
        ];

        $data = [
            'model' => $model,
            'messages' => $messages,
            'temperature' => 0.7,
            'max_tokens' => 2000
        ];

        // xAI uses OpenAI-compatible API
        $ch = curl_init('https://api.x.ai/v1/chat/completions');
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $apiKey
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

        if (curl_errno($ch)) {
            $error = curl_error($ch);
            curl_close($ch);
            throw new \Exception('xAI API error: ' . $error);
        }

        curl_close($ch);

        if ($httpCode !== 200) {
            throw new \Exception('xAI API returned HTTP ' . $httpCode . ': ' . $response);
        }

        $result = json_decode($response, true);

        if (!isset($result['choices'][0]['message']['content'])) {
            throw new \Exception('Invalid response from xAI.');
        }

        return $this->extractJsonFromResponse($result['choices'][0]['message']['content']);
    }

    /**
     * Call local model (Ollama or LM Studio)
     *
     * @param   string  $prompt         The user's prompt
     * @param   string  $currentLayout  The current layout
     * @param   string  $mode           Mode (element or ui_plan)
     *
     * @return  string  The generated JSON
     *
     * @since   3.0.0
     * @throws  \Exception
     */
    private function callLocalModel(string $prompt, string $currentLayout, string $mode = 'element'): string
    {
        $endpoint = $this->params->get('local_endpoint', 'http://localhost:11434/api/generate');
        $model = $this->params->get('model_name', 'llama3.1:70b');

        if (empty($endpoint)) {
            throw new \Exception('Local endpoint not configured. Set it in plugin settings.');
        }

        $systemPrompt = $this->getSystemPrompt($mode);
        $fullPrompt = $systemPrompt . "\n\nCurrent Layout:\n" . $currentLayout . "\n\nUser Request: " . $prompt;

        // Detect endpoint type (Ollama vs LM Studio)
        $isOllama = strpos($endpoint, '/api/generate') !== false;

        if ($isOllama) {
            // Ollama format
            $data = [
                'model' => $model,
                'prompt' => $fullPrompt,
                'stream' => false,
                'options' => [
                    'temperature' => 0.7,
                    'num_predict' => 2000
                ]
            ];
        } else {
            // LM Studio / OpenAI-compatible format
            $data = [
                'model' => $model,
                'messages' => [
                    ['role' => 'system', 'content' => $systemPrompt],
                    ['role' => 'user', 'content' => "Current Layout:\n" . $currentLayout],
                    ['role' => 'user', 'content' => "User Request: " . $prompt]
                ],
                'temperature' => 0.7,
                'max_tokens' => 2000
            ];
        }

        $ch = curl_init($endpoint);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
        curl_setopt($ch, CURLOPT_TIMEOUT, 120); // Longer timeout for local models

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

        if (curl_errno($ch)) {
            $error = curl_error($ch);
            curl_close($ch);
            throw new \Exception('Local model error: ' . $error . '. Make sure Ollama/LM Studio is running.');
        }

        curl_close($ch);

        if ($httpCode !== 200) {
            throw new \Exception('Local model returned HTTP ' . $httpCode . ': ' . $response);
        }

        $result = json_decode($response, true);

        // Extract response based on endpoint type
        if ($isOllama) {
            if (!isset($result['response'])) {
                throw new \Exception('Invalid response from Ollama.');
            }
            $responseText = $result['response'];
        } else {
            // LM Studio / OpenAI-compatible
            if (!isset($result['choices'][0]['message']['content'])) {
                throw new \Exception('Invalid response from local model.');
            }
            $responseText = $result['choices'][0]['message']['content'];
        }

        return $this->extractJsonFromResponse($responseText);
    }

    /**
     * Get the system prompt for AI
     *
     * @return  string  The system prompt
     *
     * @since   1.0.0
     */
    private function getSystemPrompt(string $mode = 'element'): string
    {
        // This single, comprehensive prompt is designed to make the AI aware of its environment and capabilities.
        return <<<PROMPT
You are an expert AI assistant for Joomla and YOOtheme Pro. Your capabilities include:
1.  **Generating YOOtheme Pro element JSON**: You can create valid JSON for any YOOtheme element.
2.  **Planning UI Automation**: You can create a plan of actions to be executed by a Puppeteer-like automation engine. The available actions are: `click`, `type`, `select`, `drag`, `scroll`, `wait`, `navigateTo`, `readText`, `readAttribute`.
3.  **Answering questions about Joomla and YOOtheme**: You have been trained on the official documentation.

**YOOtheme Pro Builder Context:**

*   **Structure**: The page is built with Sections, which contain Rows. Rows contain Columns, and Columns contain Elements.
*   **Key Elements**:
    *   **Basic**: `headline`, `text`, `image`, `button`, `video`
    *   **Layout**: `section`, `row`, `column`, `grid`, `panel`, `sublayout`
    *   **Multiple Items**: `gallery`, `slideshow`, `list`
    *   **System**: `breadcrumbs`, `search`, `login`, `position`
*   **Element Properties**: Elements have `props` which control their appearance and behavior. Common props include `content`, `text_align`, `title_element`, `margin`, `padding`, `width`, `image`.
*   **Dynamic Content**: Elements can load content dynamically from Joomla articles, custom fields, and other sources.

**Joomla Context:**

*   **Core Concepts**:
    *   **Articles**: The main content items.
    *   **Categories**: Used to organize articles.
    *   **Components**: The main functional units of a page (e.g., `com_content` for articles).
    *   **Modules**: Smaller blocks of content that can be placed in various positions around the main component.
    *   **Plugins**: Extend Joomla's functionality, often by responding to events.
*   **You operate within the YOOtheme Pro component inside the Joomla administrator.** Your actions should be relevant to this context.

**Your Task:**

Based on the user's request, decide which capability to use.

*   If the user asks you to **create or add an element**, respond with the YOOtheme element JSON.
*   If the user asks you to **perform an action** (e.g., "click on the save button", "change the text of the headline"), respond with a JSON array of automation steps.
*   If the user asks a **question**, provide a concise and accurate answer based on your knowledge.

You are focused and concise. You do not explain your actions unless asked. You are inside the AI Builder plugin, and your only goal is to help the user build their website.
PROMPT;
    }

    /**
     * Extract JSON from AI response (handles markdown code blocks)
     *
     * @param   string  $response  The AI response
     *
     * @return  string  The extracted JSON
     *
     * @since   1.0.0
     * @throws  \Exception
     */
    private function extractJsonFromResponse(string $response): string
    {
        // Remove markdown code blocks if present
        $response = preg_replace('/```json\s*/', '', $response);
        $response = preg_replace('/```\s*/', '', $response);
        $response = trim($response);

        // Validate JSON
        $decoded = json_decode($response, true);

        if ($decoded === null) {
            throw new \Exception('AI generated invalid JSON: ' . json_last_error_msg());
        }

        return $response;
    }

    /**
     * Update YOOtheme layout in the database
     *
     * @param   int     $styleId          The template style ID
     * @param   string  $newElementJson   The new element JSON to add
     *
     * @return  boolean  True on success
     *
     * @since   1.0.0
     * @throws  \Exception
     */
    private function updateYooThemeLayout(int $styleId, string $newElementJson): bool
    {
        // Load current params
        $query = $this->db->getQuery(true)
            ->select($this->db->quoteName('params'))
            ->from($this->db->quoteName('#__template_styles'))
            ->where($this->db->quoteName('id') . ' = :styleid')
            ->bind(':styleid', $styleId, \Joomla\Database\ParameterType::INTEGER);

        $this->db->setQuery($query);
        $paramsStr = $this->db->loadResult();

        if (empty($paramsStr)) {
            throw new \Exception('Template style not found.');
        }

        // Decode params
        $paramsObj = json_decode($paramsStr, true);

        if ($paramsObj === null) {
            throw new \Exception('Failed to decode template params.');
        }

        // Decode new element
        $newElementObj = json_decode($newElementJson, true);

        if ($newElementObj === null) {
            throw new \Exception('AI generated invalid JSON for the new element.');
        }

        // Initialize builder array if it doesn't exist
        if (!isset($paramsObj['builder']) || !is_array($paramsObj['builder'])) {
            $paramsObj['builder'] = [];
        }

        // Ensure the new element has a unique ID
        if (!isset($newElementObj['id'])) {
            $newElementObj['id'] = 'ai-' . uniqid() . '-' . time();
        }

        // Add new element to builder
        // This is a simple append - in production, you might want more sophisticated merging
        $paramsObj['builder'][] = $newElementObj;

        // Log for debugging
        if ($this->params->get('debug_mode', 0)) {
            Factory::getApplication()->enqueueMessage(
                'AI Builder: Added element with ID ' . $newElementObj['id'],
                'info'
            );
            Factory::getApplication()->enqueueMessage(
                'AI Builder: New builder has ' . count($paramsObj['builder']) . ' elements',
                'info'
            );
        }

        // Re-encode params
        $newParamsStr = json_encode($paramsObj);

        if ($newParamsStr === false) {
            throw new \Exception('Failed to encode new params.');
        }

        // Update database
        $updateQuery = $this->db->getQuery(true)
            ->update($this->db->quoteName('#__template_styles'))
            ->set($this->db->quoteName('params') . ' = :params')
            ->where($this->db->quoteName('id') . ' = :styleid')
            ->bind(':params', $newParamsStr)
            ->bind(':styleid', $styleId, \Joomla\Database\ParameterType::INTEGER);

        $this->db->setQuery($updateQuery);

        $result = $this->db->execute();

        // If successful, trigger system event that YOOtheme listens to for layout updates
        if ($result) {
            // Optionally clear any caches that might be affecting YOOtheme's layout loading
            $this->clearYooThemeCache($styleId);
        }

        return $result;
    }

    /**
     * Clear YOOtheme-related caches for the given style ID
     *
     * @param   int  $styleId  The template style ID
     *
     * @return  void
     *
     * @since   1.0.0
     */
    private function clearYooThemeCache(int $styleId): void
    {
        try {
            // Clear Joomla's template cache for this style
            $cache = Factory::getCache();
            $cache->clean('com_templates');

            // Also clear general cache to ensure fresh layout loading
            $cache->clean('_system');

            // If YOOtheme has specific cache files, try to clear them
            $tempPath = JPATH_ROOT . '/cache';

            // Look for any YOOtheme cache files and clear them
            if (is_dir($tempPath)) {
                $files = glob($tempPath . '/yootheme_*');
                foreach ($files as $file) {
                    if (is_file($file)) {
                        unlink($file);
                    }
                }
            }
        } catch (\Exception $e) {
            // If cache clearing fails, continue anyway
            // This is just a performance optimization
            if ($this->params->get('debug_mode', 0)) {
                \Joomla\CMS\Factory::getApplication()->enqueueMessage(
                    'AI Builder: Cache clearing failed: ' . $e->getMessage(),
                    'warning'
                );
            }
        }
    }

    /**
     * Check if current user has permission to use the AI Builder
     *
     * @return  boolean  True if authorized
     *
     * @since   1.0.0
     */
    private function checkUserPermissions(): bool
    {
        $user = Factory::getUser();

        // Must be logged in
        if ($user->guest) {
            return false;
        }

        // Check if specific users are allowed
        $allowedUsers = $this->params->get('allowed_users', '');

        if (!empty($allowedUsers)) {
            $allowedIds = array_map('trim', explode(',', $allowedUsers));
            return in_array((string) $user->id, $allowedIds, true);
        }

        // Default: allow Super Users and Administrators
        return $user->authorise('core.admin');
    }

    /**
     * Send JSON response
     *
     * @param   boolean  $success  Success status
     * @param   string   $message  Response message
     * @param   array    $data     Additional data
     * @param   integer  $code     HTTP status code
     *
     * @return  void
     *
     * @since   1.0.0
     */
    private function sendJsonResponse(bool $success, string $message, array $data = [], int $code = 200): void
    {
        $response = new JsonResponse($data, $message, !$success);

        // Send the JsonResponse which handles formatting properly
        $this->app->setHeader('Content-Type', 'application/json');
        $this->app->setHeader('status', $code);
        echo $response->toString();
        $this->app->close();
    }

    /**
     * Log error for debugging
     *
     * @param   \Exception  $e  The exception
     *
     * @return  void
     *
     * @since   1.0.0
     */
    private function logError(\Exception $e): void
    {
        if ($this->params->get('debug_mode', 0)) {
            Factory::getApplication()->enqueueMessage(
                'AI Builder Error: ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine(),
                'error'
            );
        }
    }

    /**
     * Process vision/multi-modal request
     *
     * @return  array  The vision response
     *
     * @since   5.0.0
     * @throws  \Exception
     */
    private function processVisionRequest(): array
    {
        $input = $this->app->input;

        // Get request data
        $json = $input->getRaw('json');
        $data = json_decode($json, true);

        if (!$data) {
            throw new \Exception('Invalid JSON in request body');
        }

        $images = $data['images'] ?? [];
        $prompt = $data['prompt'] ?? '';
        $maxTokens = $data['maxTokens'] ?? 2000;

        if (empty($images)) {
            throw new \Exception('No images provided');
        }

        if (empty($prompt)) {
            throw new \Exception('Missing prompt');
        }

        // Call vision-capable AI model
        $response = $this->callVisionModel($images, $prompt, $maxTokens);

        return [
            'response' => $response,
            'model' => $this->params->get('model_name', 'default'),
            'provider' => $this->params->get('ai_provider', 'local'),
            'imagesProcessed' => count($images),
            'timestamp' => date('Y-m-d H:i:s')
        ];
    }

    /**
     * Call vision-capable AI model
     *
     * @param   array   $images    Array of base64 images
     * @param   string  $prompt    The prompt
     * @param   int     $maxTokens Max tokens
     *
     * @return  string  The AI response
     *
     * @since   5.0.0
     * @throws  \Exception
     */
    private function callVisionModel(array $images, string $prompt, int $maxTokens): string
    {
        $provider = $this->params->get('ai_provider', 'local');

        switch ($provider) {
            case 'google':
                return $this->callGoogleVision($images, $prompt, $maxTokens);

            case 'openai':
                return $this->callOpenAIVision($images, $prompt, $maxTokens);

            case 'anthropic':
                return $this->callAnthropicVision($images, $prompt, $maxTokens);

            default:
                throw new \Exception('Vision not supported for provider: ' . $provider . '. Use Google (Gemini), OpenAI (GPT-4V), or Anthropic (Claude).');
        }
    }

    /**
     * Call Google Gemini Vision
     *
     * @param   array   $images    Base64 images
     * @param   string  $prompt    Prompt
     * @param   int     $maxTokens Max tokens
     *
     * @return  string  Response
     *
     * @since   5.0.0
     * @throws  \Exception
     */
    private function callGoogleVision(array $images, string $prompt, int $maxTokens): string
    {
        $apiKey = $this->params->get('google_api_key', '');

        if (empty($apiKey)) {
            throw new \Exception('Google AI API key not configured');
        }

        $model = $this->params->get('model_name', 'gemini-2.0-flash-exp');

        // Build parts array with text and images
        $parts = [['text' => $prompt]];

        foreach ($images as $image) {
            // Extract base64 data and mime type
            if (preg_match('/^data:image\/(\w+);base64,(.+)$/', $image, $matches)) {
                $mimeType = 'image/' . $matches[1];
                $imageData = $matches[2];
            } else {
                // Assume PNG if no prefix
                $mimeType = 'image/png';
                $imageData = $image;
            }

            $parts[] = [
                'inline_data' => [
                    'mime_type' => $mimeType,
                    'data' => $imageData
                ]
            ];
        }

        $data = [
            'contents' => [
                [
                    'parts' => $parts
                ]
            ],
            'generationConfig' => [
                'temperature' => 0.7,
                'maxOutputTokens' => $maxTokens
            ]
        ];

        $url = "https://generativelanguage.googleapis.com/v1beta/models/{$model}:generateContent";

        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'x-goog-api-key: ' . $apiKey
        ]);
        curl_setopt($ch, CURLOPT_TIMEOUT, 60);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

        if (curl_errno($ch)) {
            $error = curl_error($ch);
            curl_close($ch);
            throw new \Exception('Google Vision error: ' . $error);
        }

        curl_close($ch);

        if ($httpCode !== 200) {
            throw new \Exception('Google Vision returned HTTP ' . $httpCode . ': ' . $response);
        }

        $result = json_decode($response, true);

        if (!isset($result['candidates'][0]['content']['parts'][0]['text'])) {
            throw new \Exception('Invalid response from Google Vision');
        }

        return $result['candidates'][0]['content']['parts'][0]['text'];
    }

    /**
     * Call OpenAI GPT-4 Vision
     *
     * @param   array   $images    Base64 images
     * @param   string  $prompt    Prompt
     * @param   int     $maxTokens Max tokens
     *
     * @return  string  Response
     *
     * @since   5.0.0
     * @throws  \Exception
     */
    private function callOpenAIVision(array $images, string $prompt, int $maxTokens): string
    {
        $apiKey = $this->params->get('openai_api_key', '');

        if (empty($apiKey)) {
            throw new \Exception('OpenAI API key not configured');
        }

        $model = $this->params->get('model_name', 'gpt-4-vision-preview');

        // Build content array
        $content = [
            ['type' => 'text', 'text' => $prompt]
        ];

        foreach ($images as $image) {
            $content[] = [
                'type' => 'image_url',
                'image_url' => [
                    'url' => $image
                ]
            ];
        }

        $data = [
            'model' => $model,
            'messages' => [
                [
                    'role' => 'user',
                    'content' => $content
                ]
            ],
            'max_tokens' => $maxTokens
        ];

        $ch = curl_init('https://api.openai.com/v1/chat/completions');
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $apiKey
        ]);
        curl_setopt($ch, CURLOPT_TIMEOUT, 60);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

        if (curl_errno($ch)) {
            $error = curl_error($ch);
            curl_close($ch);
            throw new \Exception('OpenAI Vision error: ' . $error);
        }

        curl_close($ch);

        if ($httpCode !== 200) {
            throw new \Exception('OpenAI Vision returned HTTP ' . $httpCode . ': ' . $response);
        }

        $result = json_decode($response, true);

        if (!isset($result['choices'][0]['message']['content'])) {
            throw new \Exception('Invalid response from OpenAI Vision');
        }

        return $result['choices'][0]['message']['content'];
    }

    /**
     * Call Anthropic Claude Vision
     *
     * @param   array   $images    Base64 images
     * @param   string  $prompt    Prompt
     * @param   int     $maxTokens Max tokens
     *
     * @return  string  Response
     *
     * @since   5.0.0
     * @throws  \Exception
     */
    private function callAnthropicVision(array $images, string $prompt, int $maxTokens): string
    {
        $apiKey = $this->params->get('anthropic_api_key', '');

        if (empty($apiKey)) {
            throw new \Exception('Anthropic API key not configured');
        }

        $model = $this->params->get('model_name', 'claude-3-5-sonnet-20241022');

        // Build content array
        $content = [];

        foreach ($images as $image) {
            // Extract base64 data and media type
            if (preg_match('/^data:image\/(\w+);base64,(.+)$/', $image, $matches)) {
                $mediaType = 'image/' . $matches[1];
                $imageData = $matches[2];
            } else {
                $mediaType = 'image/png';
                $imageData = $image;
            }

            $content[] = [
                'type' => 'image',
                'source' => [
                    'type' => 'base64',
                    'media_type' => $mediaType,
                    'data' => $imageData
                ]
            ];
        }

        // Add text prompt
        $content[] = [
            'type' => 'text',
            'text' => $prompt
        ];

        $data = [
            'model' => $model,
            'messages' => [
                [
                    'role' => 'user',
                    'content' => $content
                ]
            ],
            'max_tokens' => $maxTokens
        ];

        $ch = curl_init('https://api.anthropic.com/v1/messages');
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'x-api-key: ' . $apiKey,
            'anthropic-version: 2023-06-01'
        ]);
        curl_setopt($ch, CURLOPT_TIMEOUT, 60);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

        if (curl_errno($ch)) {
            $error = curl_error($ch);
            curl_close($ch);
            throw new \Exception('Anthropic Vision error: ' . $error);
        }

        curl_close($ch);

        if ($httpCode !== 200) {
            throw new \Exception('Anthropic Vision returned HTTP ' . $httpCode . ': ' . $response);
        }

        $result = json_decode($response, true);

        if (!isset($result['content'][0]['text'])) {
            throw new \Exception('Invalid response from Anthropic Vision');
        }

        return $result['content'][0]['text'];
    }

    /**
     * Process LLM request for advanced natural language understanding
     *
     * @return  array  The LLM response
     *
     * @since   5.0.0
     * @throws  \Exception
     */
    private function processLLMRequest(): array
    {
        $input = $this->app->input;

        // Get request data
        $json = $input->getRaw('json');
        $data = json_decode($json, true);

        if (!$data) {
            throw new \Exception('Invalid JSON in request body');
        }

        $systemPrompt = $data['systemPrompt'] ?? '';
        $context = $data['context'] ?? [];
        $temperature = $data['temperature'] ?? 0.7;
        $maxTokens = $data['maxTokens'] ?? 2000;

        if (empty($systemPrompt)) {
            throw new \Exception('Missing system prompt');
        }

        // Call the AI model with enhanced parameters
        $response = $this->callAiModelAdvanced($systemPrompt, $context, $temperature, $maxTokens);

        return [
            'response' => $response,
            'model' => $this->params->get('model_name', 'default'),
            'provider' => $this->params->get('ai_provider', 'local'),
            'timestamp' => date('Y-m-d H:i:s')
        ];
    }

    /**
     * Call AI model with advanced parameters for LLM integration
     *
     * @param   string  $systemPrompt  The system prompt with instructions
     * @param   array   $context       Additional context data
     * @param   float   $temperature   Creativity level (0-1)
     * @param   int     $maxTokens     Maximum tokens to generate
     *
     * @return  string  The AI response
     *
     * @since   5.0.0
     * @throws  \Exception
     */
    private function callAiModelAdvanced(string $systemPrompt, array $context, float $temperature, int $maxTokens): string
    {
        $provider = $this->params->get('ai_provider', 'local');

        // Build the full prompt with context
        $fullPrompt = $systemPrompt;

        if (!empty($context['command'])) {
            $fullPrompt .= "\n\nUser Command: " . $context['command'];
        }

        switch ($provider) {
            case 'google':
                return $this->callGoogleAIAdvanced($fullPrompt, $temperature, $maxTokens);

            case 'openai':
                return $this->callOpenAIAdvanced($fullPrompt, $temperature, $maxTokens);

            case 'anthropic':
                return $this->callAnthropicAdvanced($fullPrompt, $temperature, $maxTokens);

            case 'xai':
                return $this->callXAIAdvanced($fullPrompt, $temperature, $maxTokens);

            case 'local':
                return $this->callLocalModelAdvanced($fullPrompt, $temperature, $maxTokens);

            default:
                throw new \Exception('Invalid AI provider: ' . $provider);
        }
    }

    /**
     * Call Google AI with advanced parameters
     *
     * @param   string  $prompt      The full prompt
     * @param   float   $temperature Temperature setting
     * @param   int     $maxTokens   Max tokens
     *
     * @return  string  The response
     *
     * @since   5.0.0
     * @throws  \Exception
     */
    private function callGoogleAIAdvanced(string $prompt, float $temperature, int $maxTokens): string
    {
        $apiKey = $this->params->get('google_api_key', '');

        if (empty($apiKey)) {
            throw new \Exception('Google AI API key not configured');
        }

        $model = $this->params->get('model_name', 'gemini-2.0-flash-exp');

        $data = [
            'contents' => [
                [
                    'parts' => [
                        ['text' => $prompt]
                    ]
                ]
            ],
            'generationConfig' => [
                'temperature' => $temperature,
                'maxOutputTokens' => $maxTokens
            ]
        ];

        $url = "https://generativelanguage.googleapis.com/v1beta/models/{$model}:generateContent";

        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'x-goog-api-key: ' . $apiKey
        ]);
        curl_setopt($ch, CURLOPT_TIMEOUT, 60);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

        if (curl_errno($ch)) {
            $error = curl_error($ch);
            curl_close($ch);
            throw new \Exception('Google AI error: ' . $error);
        }

        curl_close($ch);

        if ($httpCode !== 200) {
            throw new \Exception('Google AI returned HTTP ' . $httpCode . ': ' . $response);
        }

        $result = json_decode($response, true);

        if (!isset($result['candidates'][0]['content']['parts'][0]['text'])) {
            throw new \Exception('Invalid response from Google AI');
        }

        return $result['candidates'][0]['content']['parts'][0]['text'];
    }

    /**
     * Call OpenAI with advanced parameters
     *
     * @param   string  $prompt      The full prompt
     * @param   float   $temperature Temperature setting
     * @param   int     $maxTokens   Max tokens
     *
     * @return  string  The response
     *
     * @since   5.0.0
     * @throws  \Exception
     */
    private function callOpenAIAdvanced(string $prompt, float $temperature, int $maxTokens): string
    {
        $apiKey = $this->params->get('openai_api_key', '');

        if (empty($apiKey)) {
            throw new \Exception('OpenAI API key not configured');
        }

        $model = $this->params->get('model_name', 'gpt-4');

        $data = [
            'model' => $model,
            'messages' => [
                ['role' => 'user', 'content' => $prompt]
            ],
            'temperature' => $temperature,
            'max_tokens' => $maxTokens
        ];

        $ch = curl_init('https://api.openai.com/v1/chat/completions');
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $apiKey
        ]);
        curl_setopt($ch, CURLOPT_TIMEOUT, 60);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

        if (curl_errno($ch)) {
            $error = curl_error($ch);
            curl_close($ch);
            throw new \Exception('OpenAI error: ' . $error);
        }

        curl_close($ch);

        if ($httpCode !== 200) {
            throw new \Exception('OpenAI returned HTTP ' . $httpCode . ': ' . $response);
        }

        $result = json_decode($response, true);

        if (!isset($result['choices'][0]['message']['content'])) {
            throw new \Exception('Invalid response from OpenAI');
        }

        return $result['choices'][0]['message']['content'];
    }

    /**
     * Call Anthropic Claude with advanced parameters
     *
     * @param   string  $prompt      The full prompt
     * @param   float   $temperature Temperature setting
     * @param   int     $maxTokens   Max tokens
     *
     * @return  string  The response
     *
     * @since   5.0.0
     * @throws  \Exception
     */
    private function callAnthropicAdvanced(string $prompt, float $temperature, int $maxTokens): string
    {
        $apiKey = $this->params->get('anthropic_api_key', '');

        if (empty($apiKey)) {
            throw new \Exception('Anthropic API key not configured');
        }

        $model = $this->params->get('model_name', 'claude-3-5-sonnet-20241022');

        $data = [
            'model' => $model,
            'messages' => [
                ['role' => 'user', 'content' => $prompt]
            ],
            'temperature' => $temperature,
            'max_tokens' => $maxTokens
        ];

        $ch = curl_init('https://api.anthropic.com/v1/messages');
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'x-api-key: ' . $apiKey,
            'anthropic-version: 2023-06-01'
        ]);
        curl_setopt($ch, CURLOPT_TIMEOUT, 60);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

        if (curl_errno($ch)) {
            $error = curl_error($ch);
            curl_close($ch);
            throw new \Exception('Anthropic error: ' . $error);
        }

        curl_close($ch);

        if ($httpCode !== 200) {
            throw new \Exception('Anthropic returned HTTP ' . $httpCode . ': ' . $response);
        }

        $result = json_decode($response, true);

        if (!isset($result['content'][0]['text'])) {
            throw new \Exception('Invalid response from Anthropic');
        }

        return $result['content'][0]['text'];
    }

    /**
     * Call xAI with advanced parameters
     *
     * @param   string  $prompt      The full prompt
     * @param   float   $temperature Temperature setting
     * @param   int     $maxTokens   Max tokens
     *
     * @return  string  The response
     *
     * @since   5.0.0
     * @throws  \Exception
     */
    private function callXAIAdvanced(string $prompt, float $temperature, int $maxTokens): string
    {
        $apiKey = $this->params->get('xai_api_key', '');

        if (empty($apiKey)) {
            throw new \Exception('xAI API key not configured');
        }

        $model = $this->params->get('model_name', 'grok-2-1212');

        $data = [
            'model' => $model,
            'messages' => [
                ['role' => 'user', 'content' => $prompt]
            ],
            'temperature' => $temperature,
            'max_tokens' => $maxTokens
        ];

        $ch = curl_init('https://api.x.ai/v1/chat/completions');
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'Authorization: Bearer ' . $apiKey
        ]);
        curl_setopt($ch, CURLOPT_TIMEOUT, 60);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

        if (curl_errno($ch)) {
            $error = curl_error($ch);
            curl_close($ch);
            throw new \Exception('xAI error: ' . $error);
        }

        curl_close($ch);

        if ($httpCode !== 200) {
            throw new \Exception('xAI returned HTTP ' . $httpCode . ': ' . $response);
        }

        $result = json_decode($response, true);

        if (!isset($result['choices'][0]['message']['content'])) {
            throw new \Exception('Invalid response from xAI');
        }

        return $result['choices'][0]['message']['content'];
    }

    /**
     * Call local model with advanced parameters
     *
     * @param   string  $prompt      The full prompt
     * @param   float   $temperature Temperature setting
     * @param   int     $maxTokens   Max tokens
     *
     * @return  string  The response
     *
     * @since   5.0.0
     * @throws  \Exception
     */
    private function callLocalModelAdvanced(string $prompt, float $temperature, int $maxTokens): string
    {
        $endpoint = $this->params->get('local_endpoint', 'http://localhost:11434/api/generate');
        $model = $this->params->get('model_name', 'llama3.1:70b');

        if (empty($endpoint)) {
            throw new \Exception('Local endpoint not configured');
        }

        $isOllama = strpos($endpoint, '/api/generate') !== false;

        if ($isOllama) {
            $data = [
                'model' => $model,
                'prompt' => $prompt,
                'stream' => false,
                'options' => [
                    'temperature' => $temperature,
                    'num_predict' => $maxTokens
                ]
            ];
        } else {
            $data = [
                'model' => $model,
                'messages' => [
                    ['role' => 'user', 'content' => $prompt]
                ],
                'temperature' => $temperature,
                'max_tokens' => $maxTokens
            ];
        }

        $ch = curl_init($endpoint);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
        curl_setopt($ch, CURLOPT_TIMEOUT, 120);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

        if (curl_errno($ch)) {
            $error = curl_error($ch);
            curl_close($ch);
            throw new \Exception('Local model error: ' . $error);
        }

        curl_close($ch);

        if ($httpCode !== 200) {
            throw new \Exception('Local model returned HTTP ' . $httpCode . ': ' . $response);
        }

        $result = json_decode($response, true);

        if ($isOllama) {
            if (!isset($result['response'])) {
                throw new \Exception('Invalid response from Ollama');
            }
            return $result['response'];
        } else {
            if (!isset($result['choices'][0]['message']['content'])) {
                throw new \Exception('Invalid response from local model');
            }
            return $result['choices'][0]['message']['content'];
        }
    }

    /**
     * Normalize the AI-provided UI action plan
     *
     * @param   array   $plan    Raw plan from AI
     * @param   string  $prompt  Original user prompt
     *
     * @return  array
     *
     * @since   1.1.0
     */
    private function normalizeUiActionPlan(array $plan, string $prompt): array
    {
        if (empty($plan['action'])) {
            throw new \Exception('AI plan missing action.');
        }

        $actionMap = [
            'edit' => 'edit_text',
            'edit_text' => 'edit_text',
            'update_text' => 'edit_text',
            'change_text' => 'edit_text',
            'add' => 'add_element',
            'add_element' => 'add_element',
            'create' => 'add_element',
            'remove' => 'remove_element',
            'remove_element' => 'remove_element',
            'delete' => 'remove_element',
        ];

        $rawAction = strtolower((string) $plan['action']);
        $normalizedAction = $actionMap[$rawAction] ?? $rawAction;

        if (!in_array($normalizedAction, ['edit_text', 'add_element', 'remove_element'], true)) {
            throw new \Exception('Unsupported plan action: ' . $plan['action']);
        }

        $plan['action'] = $normalizedAction;

        if (!isset($plan['text']) && isset($plan['newText'])) {
            $plan['text'] = $plan['newText'];
        }

        if (empty($plan['selector']) && !empty($plan['target'])) {
            $plan['selector'] = $plan['target'];
        }

        if (empty($plan['target']) && !empty($plan['selector'])) {
            $plan['target'] = $plan['selector'];
        }

        if (!isset($plan['text'])) {
            $plan['text'] = '';
        }

        $plan['prompt'] = $prompt;

        return $plan;
    }
}
