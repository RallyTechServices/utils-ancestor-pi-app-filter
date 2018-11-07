# @agile-central-technical-services/utils-ancestor-pi-app-filter

An app plugin that adds an ancestor portfolio item filter and project scoping to the app, or, if placed on a page containing
a version of this plugin configured as a `publisher`, will listen for an ancestor filter from the publisher
app.

The plugin will:
* add an app setting that controls if ancestor filtering is enabled
* If the setting is enabled
   * search the app for a container with the id of
`Utils.AncestorPiAppFilter.RENDER_AREA_ID` (or a specified id) and add a portfolio type picker, a portfolio item picker
and a project scoping control.
   * listen for events from any apps using this plugin as a publisher
   * if a publisher is detected, the local portfolio type and picker will be hidden and
filter values from the publisher used instead.
* Dispatch a `ready` event when the control is ready for use.
* Dispatch a `select` event when the selected portfolio item is changed (or a publisher has changed selections)
* Make the current portfolio item available as a Rally.data.wsapi.Filter relative to a given type.
(e.g. An Epic ancestor for a HierarchicalRequirement becomes `PortfolioItem.Parent = /portfolioitem/epic/1234`)
* Make the current project scope setting available as a function call.
* If the given type doesn't have the selected portfolio item type as an ancestor, a null filter
is returned `(ObjectID = 0)`.
* To ensure the filter is fully initialized, the appliation should wait for the `ready` event before
getting the current ancestor filter.

## Screenshots
### The added filter controls.
![Screenshot](https://github.com/RallyTechServices/utils-ancestor-pi-app-filter/raw/master/app-filter.png)

### The added filter settings.
![Screenshot](https://github.com/RallyTechServices/utils-ancestor-pi-app-filter/raw/master/app-filter-settings.png)

### When configured as a filter publisher.
![Screenshot](https://github.com/RallyTechServices/utils-ancestor-pi-app-filter/raw/master/app-filter-publisher.png)

### When enabled and on a page containing a publisher app.
![Screenshot](https://github.com/RallyTechServices/utils-ancestor-pi-app-filter/raw/master/app-filter-listener.png)

## Examples
### Publisher examples:
* [pi-ancestor-filter-broadcaster](https://github.com/RallyTechServices/pi-ancestor-filter-broadcaster)
for an example.

### Listener examples:
* [CFD-by-implied-state](https://github.com/RallyTechServices/CFD-by-implied-state/releases/latest)
* [custom-board](https://github.com/RallyTechServices/custom-board/releases/latest)
* [custom-grid-with-deep-export](https://github.com/RallyTechServices/custom-grid-with-deep-export/releases/latest)
* [CustomChart](https://github.com/RallyTechServices/CustomChart/releases/latest)
* [enhanced-dependency-app](https://github.com/RallyTechServices/enhanced-dependency-app/releases/latest)
* [query-counter](https://github.com/RallyTechServices/query-counter/releases/latest)

## Installation
1. Install using npm (or yarn) `npm install '@agile-central-technical-services/utils-ancestor-pi-app-filter' -D`
2. Add the file to the `javascript` section of `config.json`
    ```
     "javascript": [
        "node_modules/@agile-central-technical-services/utils-ancestor-pi-app-filter/index.js",
        ...
    ```

## Example publisher usage
```
Ext.define("PiAncestorFilterBroadcaster", {
    extend: 'Rally.app.App',
    // Add an area where the filter controls will render.
    items: [{
        id: Utils.AncestorPiAppFilter.RENDER_AREA_ID,
        xtype: 'container',
        flex: 1,
        layout: {
            type: 'hbox',
            align: 'middle',
            defaultMargins: '0 10 10 0',
        }
    }],

    launch: function() {
        this.ancestorFilterPlugin = Ext.create('Utils.AncestorPiAppFilter', {
            ptype: 'UtilsAncestorPiAppFilter',
            pluginId: 'ancestorFilterPlugin',
            publisher: true,    // Publish events to other apps using this plugin
            settingsConfig: {
                labelWidth: 150,
                margin: 10
            },
            listeners: {
                scope: this,
                ready: function(plugin) {
                    // Plugin ready, begin listening for selection changes
                    plugin.addListener({
                        scope: this,
                        select: function() {
                            // Notify any listeners of the new filter values
                            this.ancestorFilterPlugin.notifySubscribers();
                        }
                    });
                    // Notify any listeners of the current selections
                    this.ancestorFilterPlugin.notifySubscribers();
                },
            }
        });
        // Must add the filter at runtime (instead of in config) to make sure we can
        // catch its ready event.
        this.addPlugin(this.ancestorFilterPlugin);
    }
});

```

## Example stand-alone or listener usage

```
Ext.define("custom-grid-with-deep-export", {
    extend: 'Rally.app.App',
    items: [{
        id: Utils.AncestorPiAppFilter.RENDER_AREA_ID,
        xtype: 'container',
        flex: 1,
        layout: {
            type: 'hbox',
            align: 'middle',
            defaultMargins: '0 10 10 0',
        }
    }]
    
    launch: function() {
       ...
        this.ancestorFilterPlugin = Ext.create('Utils.AncestorPiAppFilter', {
            ptype: 'UtilsAncestorPiAppFilter',
            pluginId: 'ancestorFilterPlugin',
            // Set to false to prevent the '-- None --' selection option if your app can't support
            // querying by a null ancestor (e.g. Lookback _ItemHierarchy)
            allowNoEntry: true,
            settingsConfig: {
                labelWidth: 150,
                margin: 10
            },
            listeners: {
                scope: this,
                ready: function(plugin) {
                    plugin.addListener({
                        scope: this,
                        select: function() {
                            this.loadData();
                        }
                    });
                    this.loadData();
                }
            }
        });
        this.addPlugin(this.ancestorFilterPlugin);
    },
    
    loadData: function() {
        ...
        // Get current ancestor portfolio item filter
        var ancestorFilter = this.ancestorFilterPlugin.getFilterForType(artifactType);
        if (ancestorFilter) {
            filters = filters.and(ancestorFilter);
        }
        
        // Get current project scoping
        var dataContext = this.getContext.getDataContext();
        if ( this.ancestorFilterPlugin.getIgnoreProjectScope() ) {
            dataContext.project = null
        }
        ...
    }
```

## Developer Notes
To Update
1. `npm version patch` - This will update the package.json to a new version and create a git tag (e.g. `v1.0.1`). It will also run the `postversion` script
to push the changes and tag to GitHub.
2. `npm publish --access public` - This will publish the new version to npmjs.org
3. Create the new release in [`utils_file-utils/releases'](https://github.com/RallyTechServices/utils_file-utils/releases)

## Test Plan

### Settings
* PASS - Retain values after settings close and reopen
* PASS - Retain values after app reload
* PASS - Label width customizable by config.settingsConfig
* PASS - Show ancestor filter shows/hides ancestor filter
* PASS - Show ignore scope shows/hides ignore scope
* NOT IMPLEMENTED - Ignore scope by default provides default value for ignore scope control
* PASS - Ignore scope by default value used ONLY if ignore scope control not shown

### Controls
#### Publisher / Subscriber indicator
* PASS - has mouseover explaining icon

#### PI Type Picker
* PASS -  pi types
* PASS - changing types resets pi picker
* PASS - lowest level selected by default
* PASS - type remembered after reload
* PASS - changing type notifies subscribers
* PASS - unaffected by changes to controls in expanded listener

#### PI Picker
* PASS - has clear option
* PASS - has none option
* PASS - has pis that match currently selected pi type
* PASS - has pis across entire workspace
* PASS - pi remembered after reload
* PASS - changing pi notifies subscribers
* PASS - unaffected by changes to controls in expanded listener

#### Scope Control
* PASS - Current Project is default
* PASS - choice remembered after reload
* PASS - changing choice notifies subscribers
* PASS - unaffected by changes to controls in expanded listener

### As Publisher
* PASS - Shows publisher icon

### As Subscriber
* PASS - Shows subscriber icon
* PASS - Hides all controls
* PASS - Hides all controls even when own app settings show them
* NOT IMPLEMENTED - Uses publisher settings when expanded
* PASS - Uses app settings for controls when expanded
* PASS - Uses publisher filters when not expanded
* PASS - Automatically becomes subscriber when publisher added to page