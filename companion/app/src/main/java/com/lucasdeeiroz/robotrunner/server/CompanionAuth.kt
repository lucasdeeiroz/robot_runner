package com.lucasdeeiroz.robotrunner.server

import java.security.MessageDigest
import java.security.SecureRandom

/**
 * In-memory session token guarding the Companion REST server.
 *
 * The token is delivered only through the permission-protected START_SERVER broadcast
 * (extra [EXTRA_AUTH_TOKEN]) or generated locally when the server is started from the app.
 * It is never logged, persisted, or returned by any endpoint.
 */
object CompanionAuth {

    const val EXTRA_AUTH_TOKEN = "AUTH_TOKEN"

    /** NanoHTTPD lowercases header names in `session.headers`. */
    const val HEADER_NAME = "x-rr-token"

    private val TOKEN_PATTERN = Regex("^[A-Za-z0-9_-]{32,128}$")
    private val secureRandom = SecureRandom()

    @Volatile
    private var token: ByteArray? = null

    fun isValidFormat(candidate: String?): Boolean =
        candidate != null && TOKEN_PATTERN.matches(candidate)

    /** Replaces the current token. Returns false (and keeps the old token) if the format is invalid. */
    fun setToken(candidate: String?): Boolean {
        if (!isValidFormat(candidate)) return false
        token = candidate!!.toByteArray(Charsets.US_ASCII)
        return true
    }

    /** Generates a random token if none is set yet (in-app start without a desktop token). */
    fun ensureToken() {
        if (token != null) return
        val bytes = ByteArray(32)
        secureRandom.nextBytes(bytes)
        token = bytes.joinToString("") { "%02x".format(it) }.toByteArray(Charsets.US_ASCII)
    }

    fun clear() {
        token = null
    }

    /** Constant-time comparison against the current token. */
    fun matches(candidate: String?): Boolean {
        val expected = token ?: return false
        if (candidate.isNullOrEmpty()) return false
        return MessageDigest.isEqual(expected, candidate.toByteArray(Charsets.US_ASCII))
    }
}
