
export type ClassificationCriterion = "SUCCESS" | "BUSINESS_ERROR" | "VALIDATION" | "NON_FUNCTIONAL" | "ENVIRONMENT" | null;

export function classifyCriterion(criterion: string): ClassificationCriterion {
    const text = criterion.toLowerCase();

    if (text.includes("success") || text.includes("allow") || text.includes("sucesso") || text.includes("permitir")) return "SUCCESS";
    if (text.includes("business_error") || text.includes("deny") || text.includes("erro_negocio") || text.includes("negar") || text.includes("inválida")) return "BUSINESS_ERROR";
    if (text.includes("validation") || text.includes("required") || text.includes("validacao") || text.includes("obrigat") || text.includes("vazios")) return "VALIDATION";
    if (text.includes("non_functional") || text.includes("seconds") || text.includes("nao_funcional") || text.includes("segundos") || text.includes("tempo")) return "NON_FUNCTIONAL";
    if (text.includes("environment") || text.includes("available") || text.includes("ambiente") || text.includes("disponível")) return "ENVIRONMENT";

    return null;
}

export function summarizeTitle(text: string): string {
    return text.length > 50
        ? text.substring(0, 50) + "..."
        : text;
}

const TEMPLATES: Record<string, Record<string, string>> = {
    en: {
        SUCCESS: `
Scenario: CT{id} – {title}
Given that the user enters valid email and password
When requesting login
Then the system must allow access
`,
        BUSINESS_ERROR: `
Scenario: CT{id} – {title}
Given that the user enters an invalid password
When trying to authenticate
Then the system must deny access and display an error message
`,
        VALIDATION: `
Scenario: CT{id} – {title}
Given that the user enters empty required fields
When trying to authenticate
Then the system must prevent the form submission
`,
        NON_FUNCTIONAL: `
Scenario: CT{id} – {title}
Given that the user enters valid email and password
When requesting login
Then the response time must not exceed 3 seconds
`,
        ENVIRONMENT: `
Scenario: CT{id} – {title}
Given that the user is in the homologation environment
When trying to access the system
Then the system must be available
`,
        HAPPY_PATH: `
Scenario: CT{id} – {title} (Happy Path)
Given that the system is available
When the user executes "{req}" with valid data
Then the system must complete the operation successfully
`,
        SAD_PATH: `
Scenario: CT{id} – {title} (Sad Path)
Given that the system is available
When the user executes "{req}" with invalid or inconsistent data
Then the system must prevent the operation and display an error message
`
    },
    pt: {
        SUCCESS: `
Cenário: CT{id} – {title}
Dado que o usuário informe e-mail e senha válidos
Quando solicitar o login
Então o sistema deve permitir o acesso
`,
        BUSINESS_ERROR: `
Cenário: CT{id} – {title}
Dado que o usuário informe senha inválida
Quando tentar autenticar
Então o sistema deve negar o acesso e exibir mensagem de erro
`,
        VALIDATION: `
Cenário: CT{id} – {title}
Dado que o usuário informe campos obrigatórios vazios
Quando tentar autenticar
Então o sistema deve impedir o envio do formulário
`,
        NON_FUNCTIONAL: `
Cenário: CT{id} – {title}
Dado que o usuário informe e-mail e senha válidos
Quando solicitar o login
Então o tempo de resposta não deve ultrapassar 3 segundos
`,
        ENVIRONMENT: `
Cenário: CT{id} – {title}
Dado que o usuário esteja no ambiente de homologação
Quando tentar acessar o sistema
Então o sistema deve estar disponível
`,
        HAPPY_PATH: `
Cenário: CT{id} – {title} (Caminho Feliz)
Dado que o sistema esteja disponível
Quando o usuário executar "{req}" com dados válidos
Então o sistema deve concluir a operação com sucesso
`,
        SAD_PATH: `
Cenário: CT{id} – {title} (Caminho Triste)
Dado que o sistema esteja disponível
Quando o usuário executar "{req}" com dados inválidos ou inconsistentes
Então o sistema deve impedir a operação e exibir mensagem de erro
`
    },
    es: {
        SUCCESS: `
Escenario: CT{id} – {title}
Dado que el usuario ingrese correo electrónico y contraseña válidos
Cuando solicite iniciar sesión
Entonces el sistema debe permitir el acceso
`,
        BUSINESS_ERROR: `
Escenario: CT{id} – {title}
Dado que el usuario ingrese una contraseña inválida
Cuando intente autenticarse
Entonces el sistema debe negar el acceso y mostrar un mensaje de error
`,
        VALIDATION: `
Escenario: CT{id} – {title}
Dado que el usuario ingrese campos obligatorios vacíos
Cuando intente autenticarse
Entonces el sistema debe impedir el envío del formulario
`,
        NON_FUNCTIONAL: `
Escenario: CT{id} – {title}
Dado que el usuario ingrese correo electrónico y contraseña válidos
Cuando solicite iniciar sesión
Entonces el tiempo de respuesta no debe exceder los 3 segundos
`,
        ENVIRONMENT: `
Escenario: CT{id} – {title}
Dado que el usuario esté en el ambiente de homologación
Cuando intente acceder al sistema
Entonces el sistema debe estar disponible
`,
        HAPPY_PATH: `
Escenario: CT{id} – {title} (Camino Feliz)
Dado que el sistema esté disponible
Cuando el usuario ejecute "{req}" con datos válidos
Entonces el sistema debe completar la operación con éxito
`,
        SAD_PATH: `
Escenario: CT{id} – {title} (Camino Triste)
Dado que el sistema esté disponible
Cuando el usuario ejecute "{req}" con datos inválidos o inconsistentes
Entonces el sistema debe impedir la operación y mostrar un mensaje de error
`
    }
};

export function generateScenario(type: ClassificationCriterion, description: string, id: number, language: string = 'en'): string {
    const title = summarizeTitle(description);
    const lang = (language === 'pt_BR' || language === 'pt') ? 'pt' : (language === 'es_ES' || language === 'es') ? 'es' : 'en';
    const templates = TEMPLATES[lang] || TEMPLATES['en'];

    // Check if type exists in templates, otherwise return empty
    if (!type || !templates[type]) return "";

    return templates[type]
        .replace('{id}', id.toString())
        .replace('{title}', title)
        .trim();
}


export function generateTestCases(rawText: string, language: string = 'en'): string {
    if (!rawText.trim()) return "";

    const requirements = rawText
        .split("\n")
        .map(l => l.trim())
        .filter(l => l.length > 0);

    let id = 1;
    const scenarios: string[] = [];
    const lang = (language === 'pt_BR' || language === 'pt') ? 'pt' : (language === 'es_ES' || language === 'es') ? 'es' : 'en';
    const templates = TEMPLATES[lang] || TEMPLATES['en'];

    requirements.forEach(req => {
        const title = summarizeTitle(req);

        // -------- HAPPY PATH --------
        if (templates.HAPPY_PATH) {
            scenarios.push(templates.HAPPY_PATH
                .replace('{id}', id.toString())
                .replace('{title}', title)
                .replace('{req}', req)
                .trim());
            id++;
        }

        // -------- SAD PATH --------
        if (templates.SAD_PATH) {
            scenarios.push(templates.SAD_PATH
                .replace('{id}', id.toString())
                .replace('{title}', title)
                .replace('{req}', req)
                .trim());
            id++;
        }
    });

    return scenarios.join("\n\n");
}
