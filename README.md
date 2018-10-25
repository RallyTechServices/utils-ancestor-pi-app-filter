# @agile-central-technical-services/utils-ancestor-pi-app-filter

An app plugin that adds an ancestor portfolio item filter to the app, or, if placed on a page containing
a version of this plugin configured as a `publisher`, will listen for an ancestor filter from the publisher
app.

The plugin will:
* add an app setting that controls if ancestor filtering is enabled
* If the setting is enabled
   * search the app for a container with the id of
`Utils.AncestorPiAppFilter.RENDER_AREA_ID` and add a portfolio type and item picker.
   * listen for events from any apps using this plugin as a publisher
   * if a publisher is detected, the local portfolio type and picker will be hidden and
filter values from the publisher used instead.
* Dispatch a `ready` event when the control is ready for use.
* Dispatch a `select` event when the selected portfolio item is changed (or a publisher has changed selections)
* Make the current portfolio item available as a Rally.data.wsapi.Filter relative to a given type.
(e.g. An Epic ancestor for a HierarchicalRequirement becomes `PortfolioItem.Parent = /portfolioitem/epic/1234`)
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
        var ancestorFilterPlugin = Ext.create('Utils.AncestorPiAppFilter', {
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
        this.addPlugin(ancestorFilterPlugin);
    },
    
    loadData: function() {
        ...
        var ancestorFilter = this.getPlugin('ancestorFilterPlugin').getFilterForType(artifactType);
            if (ancestorFilter) {
                filters = filters.and(ancestorFilter);
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

