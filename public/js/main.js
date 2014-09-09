$( document ).ready(function() {

    $('#add1').on('click',function(jax){
        var lang_name = $('.dropdown#language_known option:selected').text(),
            fluency_name = $('.dropdown#fluency_known option:selected').text();
        var knownLang = { 
            'language':$('.dropdown#language_known option:selected').attr('id'),
            'fluency':$('.dropdown#fluency_known option:selected').attr('id'),
            'known':true
        };
        console.log(knownLang);
        // Check for empty
        if(knownLang['language'] === undefined || knownLang['language'] == '') return;
        if(knownLang['fluency'] === undefined || knownLang['fluency'] == '') return;

        $.post( "/api/add_lang", knownLang)
        .done(function( data ) {
            console.log(data);
            $('#selectL').append("<div><span id='" + knownLang['language'] + "' class='known'>" + 
                lang_name + "</span><span id='" + knownLang['fluency'] +  "' class='years'>" + 
                fluency_name + "</span><div id='pull1'><span class='minus'></span></div></div>");
        });

    });

    $('#add2').on('click',function(jax){
        var lang_name = $('.dropdown#language_learn option:selected').text(),
            fluency_name = $('.dropdown#fluency_learn option:selected').text();
        var learnLang = { 
            'language':$('.dropdown#language_learn option:selected').attr('id'),
            'fluency':$('.dropdown#fluency_learn option:selected').attr('id'),
            'known':false
        };
        console.log(learnLang);
        // Check for empty
        if(learnLang['language'] === undefined || learnLang['language'] == '') return;
        if(learnLang['fluency'] === undefined || learnLang['fluency'] == '') return;

        $.post( "/api/add_lang", learnLang)
        .done(function( data ) {
            console.log(data);
            $('#selectR').append("<div><span id='" + learnLang['language'] + "' class='known'>" + 
                lang_name + "</span><span id='" + learnLang['fluency'] +  "' class='years'>" + 
                fluency_name + "</span><div id='pull1'><span class='minus'></span></div></div>");
        });

    });

    $(document).on('click', '#pull1', function(bleh){
        var remLang = { 
            'language':$('#pull1').siblings()[0].id
        };
        $.post( "/api/remove_lang", remLang)
        .done(function( data ) {
            console.log(data);
            $('#pull1').siblings().remove() && $('#pull1').remove();
        });
    });

    $(document).on('click', '#pull2',function(b){
        var remLang = { 
            'language':$('#pull2').siblings()[0].id
        };
        $.post( "/api/remove_lang", remLang)
        .done(function( data ) {
            console.log(data);
            $('#pull2').siblings().remove() && $('#pull2').remove();
        });
    });
});
