import org.jetbrains.changelog.markdownToHTML
import org.jetbrains.intellij.platform.gradle.TestFrameworkType


fun environment(key: String) = providers.environmentVariable(key)

val platformVersion: String by project
val pluginGroup: String by project
val pluginVersion: String by project


plugins {
  kotlin("jvm") version "2.2.0"
  id("org.jetbrains.intellij.platform") version "2.7.2"
  id("org.jetbrains.changelog") version "2.1.2"
  kotlin("plugin.serialization") version "2.2.0"
}


group = pluginGroup
version = pluginVersion


repositories {
  mavenCentral()
  intellijPlatform {
    defaultRepositories()
  }
}


kotlin {
  jvmToolchain(17)
}


dependencies {
  intellijPlatform {
    create("IC", platformVersion)
    bundledPlugin("org.jetbrains.plugins.terminal")
    testFramework(TestFrameworkType.Platform)
  }

  // MCP Kotlin SDK dependencies
  implementation("io.modelcontextprotocol:kotlin-sdk:0.7.2")
  implementation("io.ktor:ktor-server-netty:2.3.11")
  implementation("io.ktor:ktor-server-core:2.3.11")
  implementation("io.ktor:ktor-server-cio:2.3.11")
  implementation("io.ktor:ktor-server-content-negotiation:2.3.11")
  implementation("io.ktor:ktor-serialization-kotlinx-json:2.3.11")
  implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.3")

  testImplementation("junit:junit:4.13.2")
  testImplementation("org.jetbrains.kotlin:kotlin-test-junit:2.2.0")
}

intellijPlatform {
  pluginConfiguration {
    ideaVersion {
      sinceBuild.set("232")
    }
  }
}


// See https://plugins.jetbrains.com/docs/intellij/tools-gradle-intellij-plugin.html#tasks
tasks {
  buildSearchableOptions {
    enabled = false
  }

  patchPluginXml {
    pluginDescription = providers.fileContents(layout.projectDirectory.file("README.md")).asText.get()
      .substringAfter("<!-- Plugin description -->")
      .substringBefore("<!-- Plugin description end -->")
      .let(::markdownToHTML)
    check(pluginDescription.get().isNotEmpty()) { "Plugin description section not found in README.md" }
  }

  signPlugin {
    certificateChain = System.getenv("CERTIFICATE_CHAIN")
    privateKey = System.getenv("PRIVATE_KEY")
    password = System.getenv("PRIVATE_KEY_PASSWORD")
  }

  publishPlugin {
    token = System.getenv("PUBLISH_TOKEN")
  }

  test {
    useJUnit()
  }
}
