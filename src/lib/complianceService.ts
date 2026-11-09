import { ComplianceRule } from './settings';

export interface ComplianceViolation {
    ruleId: string;
    ruleName: string;
    severity: 'critical' | 'warning' | 'info';
    matchedText: string;
    blockOnViolation: boolean;
}

export interface ComplianceCheckResult {
    hasViolations: boolean;
    hasBlockingViolations: boolean;
    maskedText: string;
    violations: ComplianceViolation[];
}

/**
 * Checks a line or block of text against active compliance rules.
 */
export function checkCompliance(
    text: string,
    rules: ComplianceRule[] | undefined,
    enabled: boolean | undefined
): ComplianceCheckResult {
    if (!enabled || !rules || rules.length === 0) {
        return {
            hasViolations: false,
            hasBlockingViolations: false,
            maskedText: text,
            violations: []
        };
    }

    let currentText = text;
    const violations: ComplianceViolation[] = [];
    let hasBlocking = false;

    const activeRules = rules.filter(r => r.enabled);

    for (const rule of activeRules) {
        try {
            const regex = new RegExp(rule.pattern, 'gi');
            const matches = text.match(regex);

            if (matches && matches.length > 0) {
                matches.forEach(m => {
                    violations.push({
                        ruleId: rule.id,
                        ruleName: rule.name,
                        severity: rule.severity,
                        matchedText: m,
                        blockOnViolation: rule.blockOnViolation
                    });
                });

                if (rule.blockOnViolation) {
                    hasBlocking = true;
                }

                if (rule.maskInLogs) {
                    currentText = currentText.replace(regex, `[PROTECTED_${rule.id.toUpperCase()}]`);
                }
            }
        } catch (e) {
            console.warn(`[ComplianceService] Invalid regex in rule ${rule.id}:`, e);
        }
    }

    return {
        hasViolations: violations.length > 0,
        hasBlockingViolations: hasBlocking,
        maskedText: currentText,
        violations
    };
}
