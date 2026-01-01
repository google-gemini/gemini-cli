<?php
/**
 * @package     Joomla.Plugin
 * @subpackage  System.ai_builder
 *
 * @copyright   Copyright (C) 2025 AI Builder Team
 * @license     GNU General Public License version 2 or later
 */

defined('_JEXEC') or die;

use Joomla\CMS\Plugin\CMSPlugin;

/**
 * Legacy bootstrap file for Joomla 4/5 compatibility
 *
 * This file ensures the plugin installs correctly on all Joomla 4.x and 5.x versions.
 * The actual plugin class is in src/Extension/AiBuilder.php (namespace-based).
 *
 * @since  1.0.0
 */
class PlgSystemAi_Builder extends CMSPlugin
{
    /**
     * This class is only here for installation compatibility.
     * The real plugin logic is in the namespaced class:
     * \Joomla\Plugin\System\AiBuilder\Extension\AiBuilder
     *
     * @since  1.0.0
     */
}
