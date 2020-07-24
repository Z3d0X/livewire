import store from '@/Store'

export default function () {
    store.registerHook('componentInitialized', component => {
        component.targetedLoadingElsByAction = {}
        component.genericLoadingEls = []
        component.currentlyActiveLoadingEls = []
        component.currentlyActiveUploadLoadingEls = []
    })

    store.registerHook('elementInitialized', (el, component) => {
        if (el.directives.missing('loading')) return

        const loadingDirectives = el.directives.directives.filter(i => i.type === 'loading')

        loadingDirectives.forEach(directive => {
            processLoadingDirective(component, el, directive)
        })
    })

    store.registerHook('messageSent', (component, message) => {
        const actions = message.updates.filter(action => {
            return action.type === 'callMethod'
        }).map(action => action.payload.method);

        const models = message.updates.filter(action => {
            return action.type === 'syncInput'
        }).map(action => action.payload.name);

        setLoading(component, actions.concat(models))
    })

    store.registerHook('messageFailed', component => {
        unsetLoading(component)
    })

    store.registerHook('responseReceived', component => {
        unsetLoading(component)
    })

    store.registerHook('elementRemoved', (el, component) => {
        removeLoadingEl(component, el)
    })
}

function processLoadingDirective(component, el, directive) {
    var actionNames = false

    if (el.directives.get('target')) {
        // wire:target overrides any automatic loading scoping we do.
        actionNames = el.directives.get('target').value.split(',').map(s => s.trim())
    } else {
        // If there is no wire:target, let's check for the existance of a wire:click="foo" or something,
        // and automatically scope this loading directive to that action.
        const nonActionOrModelLivewireDirectives = ['init', 'dirty', 'offline', 'target', 'loading', 'poll', 'ignore', 'key', 'id']

        actionNames = el.directives
            .all()
            .filter(i => ! nonActionOrModelLivewireDirectives.includes(i.type))
            .map(i => i.method)

        // If we found nothing, just set the loading directive to the global component. (run on every request)
        if (actionNames.length < 1) actionNames = false
    }

    addLoadingEl(
        component,
        el,
        directive,
        actionNames,
    )
}

function addLoadingEl(component, el, directive, actionsNames) {
    if (actionsNames) {
        actionsNames.forEach(actionsName => {
            if (component.targetedLoadingElsByAction[actionsName]) {
                component.targetedLoadingElsByAction[actionsName].push({el, directive})
            } else {
                component.targetedLoadingElsByAction[actionsName] = [{el, directive}]
            }
        })
    } else {
        component.genericLoadingEls.push({el, directive})
    }
}

function removeLoadingEl(component, el) {
    // Look through the global/generic elements for the element to remove.
    component.genericLoadingEls.forEach((element, index) => {
        if (element.el.isSameNode(el)) {
            component.genericLoadingEls.splice(index, 1)
        }
    })

    // Look through the targeted elements to remove.
    Object.keys(component.targetedLoadingElsByAction).forEach(key => {
        component.targetedLoadingElsByAction[key] = component.targetedLoadingElsByAction[key].filter(element => {
            return ! element.el.isSameNode(el)
        })
    })
}

function setLoading(component, actions) {
    const actionTargetedEls = actions.map(action => component.targetedLoadingElsByAction[action]).filter(el => el).flat()

    const allEls = component.genericLoadingEls.concat(actionTargetedEls)

    startLoading(allEls)

    component.currentlyActiveLoadingEls = allEls
}

export function setUploadLoading(component, modelName) {
    const actionTargetedEls = component.targetedLoadingElsByAction[modelName] || []

    const allEls = component.genericLoadingEls.concat(actionTargetedEls)

    startLoading(allEls)

    component.currentlyActiveUploadLoadingEls = allEls
}

export function unsetUploadLoading(component) {
    endLoading(component.currentlyActiveUploadLoadingEls)

    component.currentlyActiveUploadLoadingEls = []
}

function unsetLoading(component) {
    endLoading(component.currentlyActiveLoadingEls)

    component.currentlyActiveLoadingEls = []
}

function startLoading(els) {
    els.forEach(({ el, directive }) => {
        el = el.el // I'm so sorry @todo

        if (directive.modifiers.includes('class')) {
            // This is because wire:loading.class="border border-red"
            // wouldn't work with classList.add.
            const classes = directive.value.split(' ').filter(Boolean)

            if (directive.modifiers.includes('remove')) {
                el.classList.remove(...classes)
                el.__livewire_on_finish_loading = () => el.classList.add(...classes)
            } else {
                el.classList.add(...classes)
                el.__livewire_on_finish_loading = () => el.classList.remove(...classes)
            }
        } else if (directive.modifiers.includes('attr')) {
            if (directive.modifiers.includes('remove')) {
                el.removeAttribute(directive.value)
                el.__livewire_on_finish_loading = () => el.setAttribute(directive.value, true)
            } else {
                el.setAttribute(directive.value, true)
                el.__livewire_on_finish_loading = () => el.removeAttribute(directive.value)
            }
        } else {
            if (directive.modifiers.includes('remove')) {
                let cache = el.style.display
                el.style.display = 'none'
                el.__livewire_on_finish_loading = () => el.style.display = cache
            } else {
                let cache = el.style.display
                el.style.display = 'inline-block'
                el.__livewire_on_finish_loading = () => el.style.display = cache
            }
        }
    })
}

function endLoading(els) {
    els.forEach(({ el, directive }) => {
        el = el.el // I'm so sorry.

        if (el.__livewire_on_finish_loading) {
            el.__livewire_on_finish_loading()

            delete el.__livewire_on_finish_loading
        }
    })
}
